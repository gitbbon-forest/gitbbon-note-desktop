import React, { useState, useCallback } from 'react';

export type SaveStatus = 'unsaved' | 'autoSaved' | 'committed';

interface ReallyFinalButtonProps {
	status: SaveStatus;
	onReallyFinal: () => void;
	disabled?: boolean;
}

/**
 * "진짜최종" 플로팅 버튼
 * - 🔴 Red: 저장 전 (unsaved)
 * - 🟡 Yellow: 자동 저장됨 (autoSaved)
 * - 🟢 Green: 커밋 완료 (committed)
 */
export const ReallyFinalButton: React.FC<ReallyFinalButtonProps> = ({
	status,
	onReallyFinal,
	disabled = false,
}) => {
	const [isHovered, setIsHovered] = useState(false);

	const handleClick = useCallback(() => {
		if (!disabled) {
			onReallyFinal();
		}
	}, [disabled, onReallyFinal]);

	const getLedColor = (): string => {
		switch (status) {
			case 'unsaved':
				return '#ef4444'; // Red
			case 'autoSaved':
				return '#eab308'; // Yellow
			case 'committed':
				return '#22c55e'; // Green
			default:
				return '#6b7280'; // Gray
		}
	};

	const getStatusText = (): string => {
		switch (status) {
			case 'unsaved':
				return '저장 전';
			case 'autoSaved':
				return '자동 저장됨';
			case 'committed':
				return '진짜최종 완료';
			default:
				return '';
		}
	};

	return (
		<div
			className="really-final-container"
			style={{
				position: 'fixed',
				bottom: '24px',
				right: '24px',
				zIndex: 1000,
			}}
		>
			{/* Time Slider (Dummy) - 호버 시 표시 */}
			{isHovered && (
				<div
					className="time-slider-dummy"
					style={{
						position: 'absolute',
						bottom: '70px',
						right: '0',
						backgroundColor: 'var(--vscode-editor-background, #1e1e1e)',
						border: '1px solid var(--vscode-panel-border, #3c3c3c)',
						borderRadius: '8px',
						padding: '12px 16px',
						minWidth: '200px',
						boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
					}}
				>
					<div style={{
						fontSize: '12px',
						color: 'var(--vscode-descriptionForeground, #888)',
						marginBottom: '8px',
					}}>
						⏰ 타임머신 (준비 중)
					</div>
					<input
						type="range"
						min="0"
						max="100"
						defaultValue="100"
						disabled
						style={{
							width: '100%',
							opacity: 0.5,
							cursor: 'not-allowed',
						}}
					/>
					<div style={{
						fontSize: '11px',
						color: 'var(--vscode-descriptionForeground, #666)',
						marginTop: '4px',
						textAlign: 'center',
					}}>
						과거 → 현재
					</div>
				</div>
			)}

			{/* Status Tooltip */}
			{isHovered && (
				<div
					className="status-tooltip"
					style={{
						position: 'absolute',
						bottom: '60px',
						right: '60px',
						backgroundColor: 'var(--vscode-notifications-background, #252526)',
						color: 'var(--vscode-notifications-foreground, #cccccc)',
						padding: '6px 12px',
						borderRadius: '4px',
						fontSize: '12px',
						whiteSpace: 'nowrap',
						boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
					}}
				>
					{getStatusText()}
				</div>
			)}

			{/* Main Button */}
			<button
				onClick={handleClick}
				onMouseEnter={() => setIsHovered(true)}
				onMouseLeave={() => setIsHovered(false)}
				disabled={disabled}
				style={{
					width: '56px',
					height: '56px',
					borderRadius: '50%',
					border: 'none',
					backgroundColor: 'var(--vscode-button-background, #0e639c)',
					color: 'var(--vscode-button-foreground, #ffffff)',
					cursor: disabled ? 'not-allowed' : 'pointer',
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					position: 'relative',
					boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
					transition: 'transform 0.2s ease, box-shadow 0.2s ease',
					transform: isHovered ? 'scale(1.1)' : 'scale(1)',
					opacity: disabled ? 0.6 : 1,
				}}
				title="진짜최종"
			>
				{/* LED Indicator */}
				<div
					className="led-indicator"
					style={{
						position: 'absolute',
						top: '4px',
						right: '4px',
						width: '12px',
						height: '12px',
						borderRadius: '50%',
						backgroundColor: getLedColor(),
						boxShadow: `0 0 8px ${getLedColor()}`,
						transition: 'background-color 0.3s ease, box-shadow 0.3s ease',
					}}
				/>
				{/* Button Icon */}
				<span style={{ fontSize: '20px' }}>✓</span>
			</button>
		</div>
	);
};
