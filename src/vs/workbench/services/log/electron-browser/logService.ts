/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILogger } from '../../../../platform/log/common/log.js';
import { INativeWorkbenchEnvironmentService } from '../../environment/electron-browser/environmentService.js';
import { LoggerChannelClient } from '../../../../platform/log/common/logIpc.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { windowLogGroup, windowLogId } from '../common/logConstants.js';
import { LogService } from '../../../../platform/log/common/logService.js';

export class NativeLogService extends LogService {

	constructor(loggerService: LoggerChannelClient, environmentService: INativeWorkbenchEnvironmentService) {

		const disposables = new DisposableStore();

		const fileLogger = disposables.add(loggerService.createLogger(environmentService.logFile, { id: windowLogId, name: windowLogGroup.name, group: windowLogGroup }));

		const otherLoggers: ILogger[] = [];
		if (environmentService.isExtensionDevelopment && !!environmentService.extensionTestsLocationURI) {
			// Extension development test CLI: forward everything to main side
			otherLoggers.push(loggerService.createConsoleMainLogger());
		} else {
			// Normal mode: Log to console -> Disabled to keep console clean
			// otherLoggers.push(new ConsoleLogger(fileLogger.getLevel()));
		}

		super(fileLogger, otherLoggers);

		this._register(disposables);
	}
}
