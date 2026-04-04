#!/bin/bash
# gitbbon custom: Issue #111 - TDE 루프 실행 스크립트
# LLM이 테스트를 실행하고, 실패 원인을 분석해 코드를 수정하고, 다시 테스트하는 루프

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "=========================================="
echo "TDE (테스트 주도 진화) 루프 시작"
echo "프로젝트: ${PROJECT_DIR}"
echo "=========================================="

# claude -p를 사용해 비대화형으로 전체 루프 실행
# LLM이 테스트 실행 → 실패 분석 → 코드 수정 → 재실행을 자율적으로 반복
claude -p "
다음 절차를 순서대로 실행해주세요:

1. 현재 디렉토리: ${PROJECT_DIR}
2. 먼저 \`npm run compile\`로 TypeScript를 컴파일하세요
3. \`node out/test/runner.js\`를 실행해 테스트 결과를 확인하세요
4. 실패한 시나리오가 있으면:
   a. test/reports/ 디렉토리의 최신 result-*.json 파일을 읽어 실패 원인을 분석하세요
   b. 실패 원인에 따라 관련 소스 파일을 수정하세요 (주석은 한국어로, 수정 주석은 '// gitbbon custom: TDE 수정 - <이유>' 형식)
   c. 다시 컴파일하고 테스트를 실행하세요
   d. 모든 테스트가 통과할 때까지 최대 3회 반복하세요
5. 최종 결과를 요약해 출력하세요

주의사항:
- aiService의 실제 LLM 호출은 수정하지 마세요 (테스트의 핵심)
- MockContextService나 시나리오 파일은 수정 가능합니다
- 테스트 실패 시 시나리오 기대값을 완화하는 방식으로 수정하지 마세요
" \
  --allowedTools "Bash,Read,Edit,Write" \
  --permission-mode acceptEdits

echo ""
echo "TDE 루프 완료"
