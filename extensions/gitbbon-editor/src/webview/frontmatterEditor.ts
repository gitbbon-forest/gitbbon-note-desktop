/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitbbon. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Frontmatter Editor
 * YAML Frontmatter를 폼 UI로 편집
 */
export class FrontmatterEditor {
	private frontmatter: Record<string, any> = {};
	private onChange: (frontmatter: Record<string, any>) => void;

	constructor(
		private container: HTMLElement,
		onChange: (frontmatter: Record<string, any>) => void
	) {
		this.onChange = onChange;
		this.render();
	}

	/**
	 * Frontmatter 설정
	 */
	public setFrontmatter(frontmatter: Record<string, any>) {
		this.frontmatter = frontmatter;
		this.render();
	}

	/**
	 * Frontmatter 가져오기
	 */
	public getFrontmatter(): Record<string, any> {
		return this.frontmatter;
	}

	/**
	 * UI 렌더링
	 */
	private render() {
		this.container.innerHTML = '';

		// Frontmatter가 비어있으면 숨김
		if (Object.keys(this.frontmatter).length === 0) {
			this.container.style.display = 'none';
			return;
		}

		this.container.style.display = 'block';

		// Title 필드 (특별 처리)
		if (this.frontmatter.title !== undefined) {
			this.renderField('title', this.frontmatter.title, 'text');
		}

		// Date 필드
		if (this.frontmatter.date !== undefined) {
			this.renderField('date', this.frontmatter.date, 'date');
		}

		// Tags 필드
		if (this.frontmatter.tags !== undefined) {
			this.renderField('tags', this.frontmatter.tags, 'tags');
		}

		// 나머지 필드들
		for (const [key, value] of Object.entries(this.frontmatter)) {
			if (key !== 'title' && key !== 'date' && key !== 'tags') {
				this.renderField(key, value, 'text');
			}
		}
	}

	/**
	 * 필드 렌더링
	 */
	private renderField(key: string, value: any, type: 'text' | 'date' | 'tags') {
		const fieldDiv = document.createElement('div');
		fieldDiv.className = 'frontmatter-field';

		const label = document.createElement('label');
		label.textContent = key;
		fieldDiv.appendChild(label);

		if (type === 'tags' && Array.isArray(value)) {
			const input = document.createElement('input');
			input.type = 'text';
			input.value = value.join(', ');
			input.addEventListener('input', (e) => {
				const target = e.target as HTMLInputElement;
				this.frontmatter[key] = target.value.split(',').map((tag) => tag.trim());
				this.onChange(this.frontmatter);
			});
			fieldDiv.appendChild(input);
		} else {
			const input = document.createElement('input');
			input.type = type === 'date' ? 'date' : 'text';
			input.value = String(value);
			input.addEventListener('input', (e) => {
				const target = e.target as HTMLInputElement;
				this.frontmatter[key] = target.value;
				this.onChange(this.frontmatter);
			});
			fieldDiv.appendChild(input);
		}

		this.container.appendChild(fieldDiv);
	}
}
