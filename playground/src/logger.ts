/**
 * Side layer: categorized loggers for @keenmate/web-playground, built on the core
 * logging module. Enable from the console:
 *
 *     window.components['web-playground'].logging.enableLogging();
 */
import { createLoggers } from '@keenmate/web-components-core';

export const LOGGING_CATEGORIES = ['INIT', 'UI', 'INTERACTION'] as const;

export const logging = createLoggers('PLAYGROUND', LOGGING_CATEGORIES);
