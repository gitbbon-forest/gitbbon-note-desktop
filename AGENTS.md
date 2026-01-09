# gitbbon Agents Instructions

## 🤖 에이전트 실행 지침

### 1. 정보 조회 우선순위
1. **README.md** - 프로젝트 전체 구조, 아키텍처, 정책 이해 (필독)
2. **AGENTS.md** - 이 문서 (실행 지침 및 작업 원칙)
3. **[Copilot Instructions](.github/copilot-instructions.md)** - 상세 코딩 스타일 및 가이드라인

### 2. 작업 원칙
- **아키텍처 준수:** "Snapshot Strategy"와 "Built-in Extension" 접근 방식 유지
    - Core 수정 최소화, Extension 형태의 기능 구현 지향
- **디커플링 원칙:** VS Code와의 분리를 준수하되, 어쩔 수 없는 것은 과감히 vscode 소스를 수정한다. 이 때 수정된 코드는 가급적 파일내에서 모아서 위치시키고, 충분한 주석을 달아야 한다.
- **일관성 유지:** 기존 코드 스타일과 패턴 따르기
- **변경 관리:** 중요 변경 사항은 반드시 사용자에게 확인 (Plan -> Execute)
- **테스트:** 기존 테스트를 유지하고, 추가 테스트를 작성한다.

### 3. 작업 시 참고사항
- 문서 수정 시 변경 이력을 명확히 남길 것
- 불명확한 부분은 임의로 판단하지 말고 사용자에게 질문할 것
- 작업 진행상황을 자주 사용자에게 알리고, 한글로 답변한다.
- 나중에 vscode-oss와 병합을 대비하기 위해서 코어의 변경사항에는 ```// gitbbon custom: <수정 이유>```와 같이 주석을 달아야 한다. 코드 삭제는 주석 처리하고, 수정 시에도 원본을 주석으로 남기고 수정된 코드를 작성한다. 주석 처리된 코드에도 반드시 ```// gitbbon custom: <이유>```를 명시해야 한다.
- 진행상황을 한국어로 자주 공유한다.
- 작업이 끝난 후에는 어떻게 결과를 확인할 수 있는지 알려준다. (예: npm run start; 혹은 npm run start:fresh..)

### 4. 유닛 테스트 (Unit Testing)
**프레임워크:** Mocha (Pure Node.js 환경)
**파일 규칙:**
- 위치: `extensions/[extension-name]/src/test/`
- 네이밍: `*.unit.test.ts` (예: [diffParser.unit.test.ts](cci:10://file:///Users/egoinglee/dev/project/gitbbon/git-note/extensions/gitbbon-manager/src/test/diffParser.unit.test.ts:0:0-0:0))
- `vscode` 모듈 import 금지 (순수 로직만 테스트)
**작성 예시:**
```typescript
import { YourClass } from '../yourModule';
import * as assert from 'assert';

describe('테스트할클래스', () => {
    it('특정 기능을 수행해야 함', () => {
        const result = 테스트할클래스.메서드();
        assert.strictEqual(result, 예상값);
    });
});
```

### 5. 자동 컴파일 (Automatic Compilation)
- 확장 기능(`extensions/gitbbon-*`)의 코드를 수정했을 때는 해당 확장 기능 폴더로 이동하여 컴파일(`npm run compile`)을 수행함으로써 변경 사항을 즉시 적용한다.
- 이를 통해 사용자가 메모리를 많이 차지하는 `npm run watch`를 상시 실행하지 않고도 개발 결과물을 확인할 수 있도록 돕는다.

### 6. 로그
- 코드를 수정하는 작업인 경우 작동 여부를 확인할 수 있는 로그를 추가한 후에 해당 로그만 사용자가 볼 수 있는 console.log filter 문자열을 정규 표현식으로 알려준다. (앞 뒤로 /도 포함)
- `로그삭제` 명령을 후속으로 실행하면 해당 로그가 삭제된다는 점을 알려서 후속 작업자가 사용자의 의도를 이해할 수 있도록 컨텍스트에 기록을 남긴다.
