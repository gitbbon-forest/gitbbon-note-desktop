/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitbbon. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

(function () {
	// VS Code API
	const vscode = acquireVsCodeApi();

	// Constants (from VS Code scmHistory.ts)
	const SWIMLANE_HEIGHT = 32; // Adapted to current row height
	const SWIMLANE_WIDTH = 11;
	const SWIMLANE_CURVE_RADIUS = 5;
	const CIRCLE_RADIUS = 4;
	const CIRCLE_STROKE_WIDTH = 2;

	// Color palette (VS Code style)
	const colorRegistry = [
		'#FFB000', // scmGraph.foreground1
		'#DC267F', // scmGraph.foreground2
		'#994F00', // scmGraph.foreground3
		'#40B0A6', // scmGraph.foreground4
		'#B66DFF', // scmGraph.foreground5
	];

	// State
	let commits = [];
	let hasMore = true;
	let isLoading = false;

	// DOM Elements
	const container = document.getElementById('graph-container');

	// ========================================
	// Initialization
	// ========================================
	function init() {
		container.addEventListener('scroll', handleScroll);
		vscode.postMessage({ type: 'ready' });
	}

	function handleScroll() {
		if (isLoading || !hasMore) return;

		const { scrollTop, scrollHeight, clientHeight } = container;
		if (scrollHeight - scrollTop - clientHeight < 100) {
			isLoading = true;
			vscode.postMessage({ type: 'loadMore' });
		}
	}

	// ========================================
	// Swimlane Algorithm (ported from VS Code)
	// ========================================

	/**
	 * Converts commits to ViewModel array with swimlane information.
	 * Ported from toISCMHistoryItemViewModelArray in scmHistory.ts
	 */
	function toViewModelArray(commits) {
		let colorIndex = -1;
		const viewModels = [];
		const colorMap = new Map(); // parentId -> color

		for (let index = 0; index < commits.length; index++) {
			const commit = commits[index];

			// Determine kind (HEAD or regular node)
			const isHead = commit.refs.some(r => r.includes('HEAD'));
			const kind = isHead ? 'HEAD' : 'node';

			// Get previous output swimlanes (or empty for first commit)
			const outputSwimlanesFromPreviousItem = viewModels.at(-1)?.outputSwimlanes ?? [];
			const inputSwimlanes = outputSwimlanesFromPreviousItem.map(s => ({ ...s }));
			const outputSwimlanes = [];

			let firstParentAdded = false;

			// Add first parent to the output
			if (commit.parents.length > 0) {
				for (const node of inputSwimlanes) {
					if (node.id === commit.hash) {
						if (!firstParentAdded) {
							// Determine color for this branch
							let color = colorMap.get(commit.hash);
							if (!color) {
								color = node.color;
							}
							outputSwimlanes.push({
								id: commit.parents[0],
								color: color
							});
							firstParentAdded = true;
						}
						continue;
					}
					outputSwimlanes.push({ ...node });
				}
			}

			// Add unprocessed parent(s) to the output
			for (let i = firstParentAdded ? 1 : 0; i < commit.parents.length; i++) {
				// Get or assign new color
				colorIndex = (colorIndex + 1) % colorRegistry.length;
				const color = colorRegistry[colorIndex];

				outputSwimlanes.push({
					id: commit.parents[i],
					color: color
				});

				// Store color for later use
				colorMap.set(commit.parents[i], color);
			}

			// If this commit wasn't in input swimlanes, it's a new branch start
			const inputIndex = inputSwimlanes.findIndex(node => node.id === commit.hash);
			if (inputIndex === -1 && commit.parents.length > 0) {
				// New commit appearing - assign a color
				colorIndex = (colorIndex + 1) % colorRegistry.length;
				const color = colorRegistry[colorIndex];

				// Find first parent in output and update its color if not set
				const firstParentOutput = outputSwimlanes.find(s => s.id === commit.parents[0]);
				if (firstParentOutput && !colorMap.has(commit.parents[0])) {
					firstParentOutput.color = color;
					colorMap.set(commit.parents[0], color);
				}
			}

			viewModels.push({
				commit,
				kind,
				inputSwimlanes,
				outputSwimlanes
			});
		}

		return viewModels;
	}

	// ========================================
	// SVG Helper Functions (ported from VS Code)
	// ========================================

	function createPath(color, strokeWidth = 1) {
		const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		path.setAttribute('fill', 'none');
		path.setAttribute('stroke-width', `${strokeWidth}px`);
		path.setAttribute('stroke-linecap', 'round');
		path.style.stroke = color;
		return path;
	}

	function drawCircle(index, radius, strokeWidth, color) {
		const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
		circle.setAttribute('cx', `${SWIMLANE_WIDTH * (index + 1)}`);
		circle.setAttribute('cy', `${SWIMLANE_HEIGHT / 2}`);
		circle.setAttribute('r', `${radius}`);
		circle.style.strokeWidth = `${strokeWidth}px`;
		if (color) {
			circle.style.fill = color;
		}
		return circle;
	}

	function drawVerticalLine(x1, y1, y2, color, strokeWidth = 1) {
		const path = createPath(color, strokeWidth);
		path.setAttribute('d', `M ${x1} ${y1} V ${y2}`);
		return path;
	}

	function findLastIndex(nodes, id) {
		for (let i = nodes.length - 1; i >= 0; i--) {
			if (nodes[i].id === id) {
				return i;
			}
		}
		return -1;
	}

	// ========================================
	// Main Graph Rendering (ported from VS Code)
	// ========================================

	/**
	 * Renders a single history item's graph as SVG.
	 * Ported from renderSCMHistoryItemGraph in scmHistory.ts
	 */
	function renderHistoryItemGraph(viewModel) {
		const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.classList.add('graph');

		const commit = viewModel.commit;
		const inputSwimlanes = viewModel.inputSwimlanes;
		const outputSwimlanes = viewModel.outputSwimlanes;

		// Find the commit in the input swimlanes
		const inputIndex = inputSwimlanes.findIndex(node => node.id === commit.hash);

		// Circle index - use the input swimlane index if present, otherwise add it to the end
		const circleIndex = inputIndex !== -1 ? inputIndex : inputSwimlanes.length;

		// Circle color - use the output swimlane color if present, otherwise the input swimlane color
		let circleColor = colorRegistry[0]; // Default
		if (circleIndex < outputSwimlanes.length) {
			circleColor = outputSwimlanes[circleIndex].color;
		} else if (circleIndex < inputSwimlanes.length) {
			circleColor = inputSwimlanes[circleIndex].color;
		}

		let outputSwimlaneIndex = 0;
		for (let index = 0; index < inputSwimlanes.length; index++) {
			const color = inputSwimlanes[index].color;

			// Current commit
			if (inputSwimlanes[index].id === commit.hash) {
				// Base commit
				if (index !== circleIndex) {
					const d = [];
					const path = createPath(color);

					// Draw /
					d.push(`M ${SWIMLANE_WIDTH * (index + 1)} 0`);
					d.push(`A ${SWIMLANE_WIDTH} ${SWIMLANE_WIDTH} 0 0 1 ${SWIMLANE_WIDTH * (index)} ${SWIMLANE_HEIGHT / 2}`);

					// Draw -
					d.push(`H ${SWIMLANE_WIDTH * (circleIndex + 1)}`);

					path.setAttribute('d', d.join(' '));
					svg.append(path);
				} else {
					outputSwimlaneIndex++;
				}
			} else {
				// Not the current commit
				if (outputSwimlaneIndex < outputSwimlanes.length &&
					inputSwimlanes[index].id === outputSwimlanes[outputSwimlaneIndex].id) {
					if (index === outputSwimlaneIndex) {
						// Draw |
						const path = drawVerticalLine(SWIMLANE_WIDTH * (index + 1), 0, SWIMLANE_HEIGHT, color);
						svg.append(path);
					} else {
						const d = [];
						const path = createPath(color);

						// Draw |
						d.push(`M ${SWIMLANE_WIDTH * (index + 1)} 0`);
						d.push(`V 6`);

						// Draw /
						d.push(`A ${SWIMLANE_CURVE_RADIUS} ${SWIMLANE_CURVE_RADIUS} 0 0 1 ${(SWIMLANE_WIDTH * (index + 1)) - SWIMLANE_CURVE_RADIUS} ${SWIMLANE_HEIGHT / 2}`);

						// Draw -
						d.push(`H ${(SWIMLANE_WIDTH * (outputSwimlaneIndex + 1)) + SWIMLANE_CURVE_RADIUS}`);

						// Draw /
						d.push(`A ${SWIMLANE_CURVE_RADIUS} ${SWIMLANE_CURVE_RADIUS} 0 0 0 ${SWIMLANE_WIDTH * (outputSwimlaneIndex + 1)} ${(SWIMLANE_HEIGHT / 2) + SWIMLANE_CURVE_RADIUS}`);

						// Draw |
						d.push(`V ${SWIMLANE_HEIGHT}`);

						path.setAttribute('d', d.join(' '));
						svg.append(path);
					}

					outputSwimlaneIndex++;
				}
			}
		}

		// Add remaining parent(s)
		for (let i = 1; i < commit.parents.length; i++) {
			const parentOutputIndex = findLastIndex(outputSwimlanes, commit.parents[i]);
			if (parentOutputIndex === -1) {
				continue;
			}

			// Draw -\
			const d = [];
			const path = createPath(outputSwimlanes[parentOutputIndex].color);

			// Draw \
			d.push(`M ${SWIMLANE_WIDTH * parentOutputIndex} ${SWIMLANE_HEIGHT / 2}`);
			d.push(`A ${SWIMLANE_WIDTH} ${SWIMLANE_WIDTH} 0 0 1 ${SWIMLANE_WIDTH * (parentOutputIndex + 1)} ${SWIMLANE_HEIGHT}`);

			// Draw -
			d.push(`M ${SWIMLANE_WIDTH * parentOutputIndex} ${SWIMLANE_HEIGHT / 2}`);
			d.push(`H ${SWIMLANE_WIDTH * (circleIndex + 1)} `);

			path.setAttribute('d', d.join(' '));
			svg.append(path);
		}

		// Draw | to *
		if (inputIndex !== -1) {
			const path = drawVerticalLine(SWIMLANE_WIDTH * (circleIndex + 1), 0, SWIMLANE_HEIGHT / 2, inputSwimlanes[inputIndex].color);
			svg.append(path);
		}

		// Draw | from *
		if (commit.parents.length > 0) {
			const path = drawVerticalLine(SWIMLANE_WIDTH * (circleIndex + 1), SWIMLANE_HEIGHT / 2, SWIMLANE_HEIGHT, circleColor);
			svg.append(path);
		}

		// Draw * (commit node)
		if (viewModel.kind === 'HEAD') {
			// HEAD - double circle
			const outerCircle = drawCircle(circleIndex, CIRCLE_RADIUS + 3, CIRCLE_STROKE_WIDTH, circleColor);
			svg.append(outerCircle);

			const innerCircle = drawCircle(circleIndex, CIRCLE_STROKE_WIDTH, CIRCLE_RADIUS);
			innerCircle.style.fill = 'var(--vscode-sideBar-background, #1e1e1e)';
			svg.append(innerCircle);
		} else {
			if (commit.parents.length > 1) {
				// Multi-parent (merge) node - double circle
				const circleOuter = drawCircle(circleIndex, CIRCLE_RADIUS + 2, CIRCLE_STROKE_WIDTH, circleColor);
				svg.append(circleOuter);

				const circleInner = drawCircle(circleIndex, CIRCLE_RADIUS - 1, CIRCLE_STROKE_WIDTH, circleColor);
				svg.append(circleInner);
			} else {
				// Regular node
				const circle = drawCircle(circleIndex, CIRCLE_RADIUS + 1, CIRCLE_STROKE_WIDTH, circleColor);
				svg.append(circle);
			}
		}

		// Set dimensions
		svg.style.height = `${SWIMLANE_HEIGHT}px`;
		svg.style.width = `${SWIMLANE_WIDTH * (Math.max(inputSwimlanes.length, outputSwimlanes.length, 1) + 1)}px`;

		return svg;
	}

	// ========================================
	// Main Render Function
	// ========================================

	function renderGraph() {
		container.innerHTML = '';

		if (commits.length === 0) {
			return;
		}

		// Convert commits to view models with swimlane info
		const viewModels = toViewModelArray(commits);

		// Render each commit
		viewModels.forEach((viewModel) => {
			const row = createCommitRow(viewModel);
			container.appendChild(row);
		});

		// Load more button
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

	function createCommitRow(viewModel) {
		const commit = viewModel.commit;
		const row = document.createElement('div');
		row.className = 'commit-row';
		row.dataset.hash = commit.hash;

		// Graph cell
		const graphCell = document.createElement('div');
		graphCell.className = 'graph-cell';
		graphCell.appendChild(renderHistoryItemGraph(viewModel));
		row.appendChild(graphCell);

		// Commit info
		const infoCell = document.createElement('div');
		infoCell.className = 'commit-info';

		// Refs labels
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

		// Message
		const messageDiv = document.createElement('div');
		messageDiv.className = 'commit-message';
		messageDiv.innerHTML = refsHtml + escapeHtml(commit.message);
		infoCell.appendChild(messageDiv);

		row.appendChild(infoCell);

		// Click event
		row.addEventListener('click', () => {
			vscode.postMessage({ type: 'commitClick', hash: commit.hash });
		});

		return row;
	}

	// ========================================
	// Utility Functions
	// ========================================

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

	function escapeHtml(text) {
		const div = document.createElement('div');
		div.textContent = text;
		return div.innerHTML;
	}

	// ========================================
	// Message Handler
	// ========================================

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

	// Initialize
	init();
})();
