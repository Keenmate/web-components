/**
 * Side layer: categorized loggers for {{PACKAGE_NAME}}, built on the core
 * logging module. Enable from the console:
 *
 *     window.components['{{TAG}}'].logging.enableLogging();
 */
import { createLoggers } from '@keenmate/web-components-core';

export const LOGGING_CATEGORIES = ['INIT', 'UI', 'INTERACTION'] as const;

export const logging = createLoggers('{{LOG_NAME}}', LOGGING_CATEGORIES);
