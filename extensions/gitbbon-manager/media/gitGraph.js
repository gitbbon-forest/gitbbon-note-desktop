/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitbbon. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

(function () {
	// VS Code API
	const vscode = acquireVsCodeApi();

	// State
	let commits = [];
	let hasMore = true;
	let isLoading = false;

	// 브랜치 색상 팔레트
	const branchColors = [
		'#4fc3f7', '#81c784', '#ffb74d', '#f06292',
		'#ba68c8', '#4db6ac', '#ff8a65', '#a1887f'
	];
	const branchColorMap = new Map();
	let colorIndex = 0;

	// DOM Elements
	const container = document.getElementById('graph-container');


	// 초기화
	function init() {


		// 스크롤 이벤트 (지연 로딩)
		container.addEventListener('scroll', handleScroll);

		// 준비 완료 알림
		vscode.postMessage({ type: 'ready' });
	}

	// 스크롤 핸들러 (지연 로딩)
	function handleScroll() {
		if (isLoading || !hasMore) return;

		const { scrollTop, scrollHeight, clientHeight } = container;
		// 하단 100px 이내로 스크롤 시 추가 로드
		if (scrollHeight - scrollTop - clientHeight < 100) {
			isLoading = true;
			vscode.postMessage({ type: 'loadMore' });
		}
	}

	// 브랜치 색상 가져오기
	function getBranchColor(branchName) {
		if (!branchColorMap.has(branchName)) {
			branchColorMap.set(branchName, branchColors[colorIndex % branchColors.length]);
			colorIndex++;
		}
		return branchColorMap.get(branchName);
	}

	// 그래프 렌더링
	function renderGraph() {
		container.innerHTML = '';

		if (commits.length === 0) {
			container.innerHTML = '';
			return;
		}

		// 커밋 해시 -> 인덱스 맵 생성
		const hashToIndex = new Map();
		commits.forEach((commit, index) => {
			hashToIndex.set(commit.hash, index);
		});

		// 각 커밋의 레인(열) 할당 및 활성 레인 정보
		const { lanes, activeLanesPerRow } = assignLanes(commits, hashToIndex);

		// 커밋 렌더링
		commits.forEach((commit, index) => {
			const row = createCommitRow(commit, index, lanes, activeLanesPerRow, hashToIndex);
			container.appendChild(row);
		});

		// 더 로드 버튼
		if (hasMore) {
			const loadMoreDiv = document.createElement('div');
			loadMoreDiv.className = 'load-more';
			loadMoreDiv.innerHTML = '<button id="load-more-btn">Load More</button>';
			container.appendChild(loadMoreDiv);

			document.getElementById('load-more-btn').addEventListener('click', () => {
				if (!isLoading) {
					isLoading = true;
					vscode.postMessage({ type: 'loadMore' });
				}
			});
		}
	}

	// 레인 할당 (활성 레인 정보도 함께 반환)
	function assignLanes(commits, hashToIndex) {
		const lanes = new Array(commits.length).fill(0);
		const activeLanesPerRow = []; // 각 행에서 활성화된 레인들 (해시 -> {lane, color})
		const activeLanes = new Map(); // 해시 -> {lane, color}

		for (let i = 0; i < commits.length; i++) {
			const commit = commits[i];

			// 현재 활성 레인들 스냅샷 저장 (이 행에서 그려질 패싱 스루 라인들)
			// Deep copy needed for the map values if they were mutable, but here we replace values.
			// Map 복사
			const currentActiveLanes = new Map();
			activeLanes.forEach((val, key) => currentActiveLanes.set(key, val));
			activeLanesPerRow.push(currentActiveLanes);

			// 현재 커밋의 색상 결정 (부모 라인 예약 시 사용)
			const branchName = commit.refs.find(r => !r.includes('HEAD') && !r.startsWith('tag:')) || 'main';
			const myColor = getBranchColor(branchName);

			// 이 커밋이 이미 레인을 가지고 있는지 확인 (부모로부터 예약됨)
			if (activeLanes.has(commit.hash)) {
				lanes[i] = activeLanes.get(commit.hash).lane;
				activeLanes.delete(commit.hash);
			} else {
				// 새 레인 찾기
				let lane = 0;
				const usedLanes = new Set();
				activeLanes.forEach(v => usedLanes.add(v.lane));

				while (usedLanes.has(lane)) {
					lane++;
				}
				lanes[i] = lane;
			}

			// 부모에게 레인 할당 (예약)
			commit.parents.forEach((parentHash, pIndex) => {
				if (hashToIndex.has(parentHash) && !activeLanes.has(parentHash)) {
					if (pIndex === 0) {
						// 첫 번째 부모는 같은 레인, 색상은 자식(나)의 색상 계승
						activeLanes.set(parentHash, { lane: lanes[i], color: myColor });
					} else {
						// 머지의 두 번째 부모는 새 레인
						let newLane = lanes[i] + 1;
						const usedLanes = new Set();
						activeLanes.forEach(v => usedLanes.add(v.lane));

						while (usedLanes.has(newLane)) {
							newLane++;
						}
						// 머지 부모로 가는 선의 색상
						const mergeColor = getBranchColor(`merge-${pIndex}-${commit.hash}`);
						activeLanes.set(parentHash, { lane: newLane, color: mergeColor });
					}
				}
			});
		}

		return { lanes, activeLanesPerRow };
	}

	// 커밋 행 생성
	function createCommitRow(commit, index, lanes, activeLanesPerRow, hashToIndex) {
		const row = document.createElement('div');
		row.className = 'commit-row';
		row.dataset.hash = commit.hash;

		// 그래프 셀
		const graphCell = document.createElement('div');
		graphCell.className = 'graph-cell';
		graphCell.appendChild(createGraphSvg(commit, index, lanes, activeLanesPerRow, hashToIndex));
		row.appendChild(graphCell);

		// 커밋 정보
		const infoCell = document.createElement('div');
		infoCell.className = 'commit-info';

		// Refs 라벨
		const refsHtml = commit.refs.map(ref => {
			let className = 'ref-label';
			if (ref.includes('HEAD')) {
				className += ' head';
			} else if (ref.startsWith('origin/') || ref.includes('->')) {
				className += ' remote';
			} else if (ref.startsWith('tag:')) {
				className += ' tag';
			} else {
				className += ' branch';
			}
			return `<span class="${className}">${escapeHtml(ref)}</span>`;
		}).join('');

		// 메시지
		const messageDiv = document.createElement('div');
		messageDiv.className = 'commit-message';
		messageDiv.innerHTML = refsHtml + escapeHtml(commit.message);
		infoCell.appendChild(messageDiv);

		// 메타 정보
		const metaDiv = document.createElement('div');
		metaDiv.className = 'commit-meta';
		const date = formatDate(commit.date);
		metaDiv.textContent = `${commit.shortHash} • ${commit.author} • ${date}`;
		infoCell.appendChild(metaDiv);

		row.appendChild(infoCell);

		// 클릭 이벤트
		row.addEventListener('click', () => {
			vscode.postMessage({ type: 'commitClick', hash: commit.hash });
		});

		return row;
	}

	// 그래프 SVG 생성
	function createGraphSvg(commit, index, lanes, activeLanesPerRow, hashToIndex) {
		const ROW_HEIGHT = 48; // CSS의 min-height와 일치
		const NODE_Y = ROW_HEIGHT / 2; // 노드는 중앙에

		const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.setAttribute('width', '100');
		svg.setAttribute('height', String(ROW_HEIGHT));

		const lane = lanes[index];
		const x = 10 + lane * 12; // 레인 간격

		// 메인 브랜치 색상 결정
		const branchName = commit.refs.find(r => !r.includes('HEAD') && !r.startsWith('tag:')) || 'main';
		const color = getBranchColor(branchName);

		// 0. 활성 레인들의 패싱 스루 라인 그리기 (이 행을 지나가는 다른 브랜치들)
		if (index < activeLanesPerRow.length) {
			const activeAtThisRow = activeLanesPerRow[index];
			activeAtThisRow.forEach((activeInfo, activeHash) => {
				const activeLane = activeInfo.lane;

				// 이 커밋의 레인이 아닌 경우에만 패싱 스루 그림
				if (activeLane !== lane) {
					const passX = 10 + activeLane * 12;
					// activeInfo.color를 사용하여 원래 브랜치 색상 유지
					const passColor = activeInfo.color;

					const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
					line.setAttribute('x1', String(passX));
					line.setAttribute('y1', '0');
					line.setAttribute('x2', String(passX));
					line.setAttribute('y2', String(ROW_HEIGHT));
					line.setAttribute('stroke', passColor);
					line.setAttribute('stroke-width', '2');
					svg.appendChild(line);
				}
			});
		}

		// 1. 위에서 내려오는 선 (이 커밋으로 연결)
		if (index > 0) {
			// 이전 커밋들 중 이 커밋을 부모로 가지는 커밋이 있는지 확인
			let hasConnectionFromAbove = false;
			for (let i = 0; i < index; i++) {
				if (commits[i].parents.includes(commit.hash) && lanes[i] === lane) {
					hasConnectionFromAbove = true;
					break;
				}
			}

			if (hasConnectionFromAbove) {
				const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
				line.setAttribute('x1', String(x));
				line.setAttribute('y1', '0');
				line.setAttribute('x2', String(x));
				line.setAttribute('y2', String(NODE_Y));
				line.setAttribute('stroke', color);
				line.setAttribute('stroke-width', '2');
				svg.appendChild(line);
			}
		}

		// 2. 아래로 내려가는 선 (부모에게 연결)
		if (commit.parents.length > 0) {
			const firstParentHash = commit.parents[0];
			const parentIndex = hashToIndex.get(firstParentHash);

			if (parentIndex !== undefined) {
				const parentLane = lanes[parentIndex];
				const parentX = 10 + parentLane * 12;

				// 같은 레인이면 직선으로 아래까지
				if (lane === parentLane) {
					const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
					line.setAttribute('x1', String(x));
					line.setAttribute('y1', String(NODE_Y));
					line.setAttribute('x2', String(x));
					line.setAttribute('y2', String(ROW_HEIGHT));
					line.setAttribute('stroke', color);
					line.setAttribute('stroke-width', '2');
					svg.appendChild(line);
				} else {
					// 다른 레인이면 곡선
					const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
					path.setAttribute('d', `M ${x} ${NODE_Y} C ${x} ${NODE_Y + 15}, ${parentX} ${ROW_HEIGHT - 15}, ${parentX} ${ROW_HEIGHT}`);
					path.setAttribute('stroke', color);
					path.setAttribute('stroke-width', '2');
					path.setAttribute('fill', 'none');
					svg.appendChild(path);
				}
			}

			// 머지 커밋의 두 번째 부모
			for (let pIndex = 1; pIndex < commit.parents.length; pIndex++) {
				const mergeParentHash = commit.parents[pIndex];
				const mergeParentIndex = hashToIndex.get(mergeParentHash);

				if (mergeParentIndex !== undefined) {
					const mergeParentLane = lanes[mergeParentIndex];
					const mergeParentX = 10 + mergeParentLane * 12;
					const mergeColor = getBranchColor(`merge-${pIndex}`);

					const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
					path.setAttribute('d', `M ${x} ${NODE_Y} C ${x} ${NODE_Y + 15}, ${mergeParentX} ${ROW_HEIGHT - 15}, ${mergeParentX} ${ROW_HEIGHT}`);
					path.setAttribute('stroke', mergeColor);
					path.setAttribute('stroke-width', '2');
					path.setAttribute('fill', 'none');
					svg.appendChild(path);
				}
			}
		}

		// 3. 커밋 노드 (원) - 맨 마지막에 그려서 선 위에 표시
		const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
		circle.setAttribute('cx', String(x));
		circle.setAttribute('cy', String(NODE_Y));
		circle.setAttribute('r', '5');
		circle.setAttribute('fill', color);
		circle.setAttribute('stroke', 'var(--vscode-sideBar-background, #1e1e1e)');
		circle.setAttribute('stroke-width', '2');
		svg.appendChild(circle);

		return svg;
	}

	// 날짜 포맷
	function formatDate(isoDate) {
		const date = new Date(isoDate);
		const now = new Date();
		const diffMs = now - date;
		const diffMins = Math.floor(diffMs / 60000);
		const diffHours = Math.floor(diffMs / 3600000);
		const diffDays = Math.floor(diffMs / 86400000);

		if (diffMins < 1) return 'just now';
		if (diffMins < 60) return `${diffMins}m ago`;
		if (diffHours < 24) return `${diffHours}h ago`;
		if (diffDays < 7) return `${diffDays}d ago`;

		return date.toLocaleDateString();
	}

	// HTML 이스케이프
	function escapeHtml(text) {
		const div = document.createElement('div');
		div.textContent = text;
		return div.innerHTML;
	}

	// 메시지 핸들러
	window.addEventListener('message', (event) => {
		const message = event.data;

		switch (message.type) {
			case 'commits':
				commits = message.commits;
				hasMore = message.hasMore;
				isLoading = false;
				renderGraph();
				break;

			case 'error':
				container.innerHTML = `<div class="error-state">${escapeHtml(message.message)}</div>`;
				isLoading = false;
				break;
		}
	});

	// 초기화 실행
	init();
})();
