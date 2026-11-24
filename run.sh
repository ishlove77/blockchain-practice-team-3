#!/usr/bin/env bash
# 로컬 데모 한 번에 실행: anvil → 컨트랙트 빌드 → 배포+데모 데이터 → 웹 서버
set -euo pipefail
cd "$(dirname "$0")"
export PATH="$HOME/.foundry/bin:$PATH"

command -v anvil >/dev/null || { echo "Foundry가 필요합니다: https://getfoundry.sh"; exit 1; }

# 데모 이력을 2024년부터 채우기 위해 체인 시작 시각을 2024-01-01로 둔다
if ! curl -s -X POST -H 'content-type: application/json' --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' http://127.0.0.1:8545 >/dev/null; then
  echo "▶ anvil 시작 (127.0.0.1:8545)"
  anvil --timestamp 1704067200 --silent &
  ANVIL_PID=$!
  trap 'kill $ANVIL_PID 2>/dev/null' EXIT
  sleep 2
else
  echo "▶ 이미 실행 중인 노드 사용 (127.0.0.1:8545) — 처음부터 다시 하려면 노드를 종료 후 재실행"
fi

[ -f contracts/lib/forge-std/src/Test.sol ] || git submodule update --init --recursive

echo "▶ 컨트랙트 빌드"
(cd contracts && forge build --silent)

echo "▶ 배포 + 데모 데이터"
(cd web && [ -d node_modules ] || npm install --silent)
(cd web && node scripts/deploy.mjs)

echo "▶ 웹 서버: http://localhost:5173"
cd web && npm run dev -- --host 127.0.0.1
