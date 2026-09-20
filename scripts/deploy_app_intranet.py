#!/usr/bin/env python3
"""把用户端 /api 进程部署到内网，并让 Nginx 把 /api/ 反代过去。"""
from __future__ import annotations

import os
import socket
import tarfile
import tempfile
import time
from pathlib import Path

import paramiko

HOST, PORT, USER = "10.0.120.2", 22, "root"
REMOTE_BASE = "/data/base"
REMOTE_APP = f"{REMOTE_BASE}/mofun-app"
REMOTE_NGINX_CONF = f"{REMOTE_BASE}/nginx/etc/nginx/conf.d/default.conf"

ROOT = Path(__file__).resolve().parents[1]
OPS = ROOT.parent / "mofun-ops-api"
PWD_FILE = ROOT / "scripts" / ".nginx_pwd"
COMPOSE_FILE = OPS / "docker-compose.mofun-app.yml"
NGINX_CONF = OPS / "nginx-default.intranet.conf"

ENV_PREFIXES = (
    "LLM_",
    "IMAGE_",
    "VIDEO_",
    "VISION_",
    "COUNTY_",
    "QWEN_",
    "WEKNORA_",
    "KB_",
    "LORA_",
    "VOLC_",
    "OMNIHUMAN_",
    "TTS_",
    "OPS_",
    "WORKFLOW_",
)


def load_pwd() -> str:
    pwd = os.environ.get("NGINX_PWD", "").strip()
    if pwd:
        return pwd
    if PWD_FILE.is_file():
        return PWD_FILE.read_text(encoding="utf-8-sig").strip()
    raise SystemExit("缺少内网 SSH 密码：写入 mofun/scripts/.nginx_pwd 或设 NGINX_PWD")


def connect(pwd: str) -> paramiko.SSHClient:
    sock = socket.create_connection((HOST, PORT), timeout=20)
    cli = paramiko.SSHClient()
    cli.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    cli.connect(
        HOST,
        PORT,
        USER,
        pwd,
        banner_timeout=30,
        auth_timeout=30,
        allow_agent=False,
        look_for_keys=False,
        sock=sock,
    )
    return cli


def run(cli: paramiko.SSHClient, cmd: str, timeout: int = 120) -> tuple[int, str, str]:
    print(f"$ {cmd[:180]}", flush=True)
    _i, o, e = cli.exec_command(cmd, timeout=timeout)
    code = o.channel.recv_exit_status()
    out = o.read().decode("utf-8", "replace")
    err = e.read().decode("utf-8", "replace")
    if out.strip():
        print(out[-8000:], flush=True)
    if err.strip():
        print(err[-4000:], flush=True)
    return code, out, err


def put(sftp: paramiko.SFTPClient, local: str, remote: str) -> None:
    size = os.path.getsize(local)
    print(f"上传 {os.path.basename(local)} ({size / 1024 / 1024:.1f} MB) → {remote}", flush=True)
    last = [time.time()]

    def cb(sent: int, total: int) -> None:
        now = time.time()
        if now - last[0] >= 2:
            print(f"  {sent // 1024 // 1024}/{total // 1024 // 1024} MB", flush=True)
            last[0] = now

    sftp.put(local, remote, callback=cb)


def tar_app(dest: Path) -> None:
    include = [
        "Dockerfile",
        ".dockerignore",
        "package.json",
        "package-lock.json",
        "tsconfig.json",
        "next-env.d.ts",
        "src",
    ]
    with tarfile.open(dest, "w:gz") as tar:
        for name in include:
            p = ROOT / name
            if not p.exists():
                raise SystemExit(f"缺少 {p}")
            tar.add(p, arcname=name)


def build_env_text() -> str:
    lines = [
        "PORT=3000",
        "HOSTNAME=0.0.0.0",
        "NODE_ENV=production",
        "OPS_API_BASE=http://mofun-ops-api:4100",
        "WORKFLOW_SELF_URL=http://127.0.0.1:3000",
        "PUBLIC_BASE_URL=http://10.0.120.2",
    ]
    seen = {line.split("=", 1)[0] for line in lines}
    src = ROOT / ".env.local"
    if src.is_file():
        for raw in src.read_text(encoding="utf-8-sig").splitlines():
            row = raw.strip()
            if not row or row.startswith("#") or "=" not in row:
                continue
            key, value = row.split("=", 1)
            key = key.strip()
            if key in seen:
                continue
            if any(key.startswith(prefix) for prefix in ENV_PREFIXES):
                lines.append(f"{key}={value}")
                seen.add(key)
    return "\n".join(lines) + "\n"


def main() -> None:
    if not COMPOSE_FILE.is_file():
        raise SystemExit(f"缺少 {COMPOSE_FILE}")
    if not NGINX_CONF.is_file():
        raise SystemExit(f"缺少 {NGINX_CONF}")

    pwd = load_pwd()
    tmp = Path(tempfile.mkdtemp(prefix="mofun-app-deploy-"))
    app_tar = tmp / "mofun-app.tar.gz"
    env_file = tmp / "mofun-app.env"
    print("打包用户端 API 源码…", flush=True)
    tar_app(app_tar)
    env_file.write_text(build_env_text(), encoding="utf-8")

    cli = connect(pwd)
    try:
        run(cli, f"mkdir -p {REMOTE_APP} {REMOTE_BASE}/nginx/etc/nginx/conf.d")
        sftp = cli.open_sftp()
        put(sftp, str(app_tar), "/tmp/mofun-app.tar.gz")
        put(sftp, str(COMPOSE_FILE), f"{REMOTE_BASE}/docker-compose.mofun-app.yml")
        put(sftp, str(NGINX_CONF), "/tmp/mofun-nginx-default.conf")
        put(sftp, str(env_file), "/tmp/mofun-app.env")
        sftp.close()

        code, _, _ = run(
            cli,
            f"rm -rf {REMOTE_APP}/src && "
            f"tar -xzf /tmp/mofun-app.tar.gz -C {REMOTE_APP} && "
            f"mv /tmp/mofun-app.env {REMOTE_APP}/.env && "
            f"cp -a {REMOTE_NGINX_CONF} {REMOTE_NGINX_CONF}.bak.$(date +%Y%m%d%H%M%S) && "
            f"cp /tmp/mofun-nginx-default.conf {REMOTE_NGINX_CONF} && "
            f"rm -f /tmp/mofun-app.tar.gz /tmp/mofun-nginx-default.conf",
        )
        if code != 0:
            raise SystemExit("解压或写配置失败")

        pull = (
            "set -e; IMG=''; "
            "if docker image inspect node:22-bookworm-slim >/dev/null 2>&1; then "
            "echo 复用已有 node:22-bookworm-slim; "
            "else "
            "for src in "
            "docker.m.daocloud.io/library/node:22-bookworm-slim "
            "docker.1ms.run/library/node:22-bookworm-slim "
            "node:22-bookworm-slim; do "
            "echo \"尝试拉取 $src\"; "
            "if docker pull \"$src\"; then IMG=$src; break; fi; "
            "done; "
            "test -n \"$IMG\" || { echo 无法拉取 node 镜像; exit 1; }; "
            "docker tag \"$IMG\" node:22-bookworm-slim; "
            "fi"
        )
        code, _, _ = run(cli, pull, timeout=420)
        if code != 0:
            raise SystemExit("基础镜像不可用")

        code, _, _ = run(
            cli,
            "export COMPOSE_BAKE=false DOCKER_BUILDKIT=0; "
            f"docker build --build-arg NODE_IMAGE=node:22-bookworm-slim "
            f"-t mofun-app:local {REMOTE_APP}",
            timeout=900,
        )
        if code != 0:
            raise SystemExit("用户端 API 镜像构建失败")

        code, _, _ = run(
            cli,
            "export COMPOSE_BAKE=false; "
            f"cd {REMOTE_BASE} && docker-compose -f docker-compose.yml "
            f"-f docker-compose.mofun-ops.yml -f docker-compose.mofun-app.yml "
            f"up -d --force-recreate mofun-app",
            timeout=180,
        )
        if code != 0:
            raise SystemExit("用户端 API 容器启动失败")

        run(cli, "sleep 3; docker exec base-nginx-1 nginx -t && docker exec base-nginx-1 nginx -s reload")
        run(cli, "docker ps --filter name=mofun-app --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'")
        run(cli, "curl -sS -o /dev/null -w 'app-health %{http_code}\\n' http://127.0.0.1/api/health")
        run(
            cli,
            "curl -sS -o /tmp/mofun-api-image.out -w 'image %{http_code} %{content_type}\\n' "
            "-X POST http://127.0.0.1/api/image -H 'Content-Type: application/json' -d '{}' ; "
            "python3 -c \"import pathlib; t=pathlib.Path('/tmp/mofun-api-image.out').read_text(errors='replace')[:180]; print(t)\"",
        )
    finally:
        cli.close()
    print("[OK] 内网用户端已接通 /api/ → http://10.0.120.2/", flush=True)


if __name__ == "__main__":
    main()
