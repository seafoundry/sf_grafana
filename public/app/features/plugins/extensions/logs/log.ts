import { isString } from 'lodash';
import { nanoid } from 'nanoid';
import { Observable, ReplaySubject } from 'rxjs';

import { Labels, LogLevel } from '@grafana/data';

export type LogItem = {
  level: LogLevel;
  timestamp: number;
  labels: Labels;
  message: string;
  id: string;
  pluginId?: string;
  extensionPointId?: string;
};

const channelName = 'ui-extension-logs';

export class ExtensionsLog {
  private baseLabels: Labels | undefined;
  private subject: ReplaySubject<LogItem> | undefined;
  private channel: BroadcastChannel;

  constructor(baseLabels?: Labels, subject?: ReplaySubject<LogItem>, channel?: BroadcastChannel) {
    this.baseLabels = baseLabels;
    this.channel = channel ?? new BroadcastChannel(channelName);
    this.subject = subject;
  }

  info(message: string, labels?: Labels): void {
    this.log(LogLevel.info, message, labels);
  }

  warning(message: string, labels?: Labels): void {
    this.log(LogLevel.warning, message, labels);
  }

  error(message: string, labels?: Labels): void {
    this.log(LogLevel.error, message, labels);
  }

  debug(message: string, labels?: Labels): void {
    this.log(LogLevel.debug, message, labels);
  }

  trace(message: string, labels?: Labels): void {
    this.log(LogLevel.trace, message, labels);
  }

  fatal(message: string, labels?: Labels): void {
    this.log(LogLevel.fatal, message, labels);
  }

  private log(level: LogLevel, message: string, labels?: Labels): void {
    const combinedLabels = { ...labels, ...this.baseLabels };
    const { pluginId, extensionPointId } = combinedLabels;

    const item: LogItem = {
      level: level,
      labels: combinedLabels,
      timestamp: Date.now(),
      id: nanoid(),
      message: message,
      pluginId: isString(pluginId) ? pluginId : undefined,
      extensionPointId: isString(extensionPointId) ? extensionPointId : undefined,
    };

    this.channel.postMessage(item);
  }

  asObservable(): Observable<LogItem> {
    if (!this.subject) {
      // Lazily create the subject on first subscription to prevent
      // to create buffers when no subscribers exists
      this.subject = new ReplaySubject<LogItem>(1000, 1000 * 60 * 10);
      this.channel.onmessage = (msg: MessageEvent<LogItem>) => this.subject?.next(msg.data);
    }

    return this.subject.asObservable();
  }

  child(labels: Labels): ExtensionsLog {
    return new ExtensionsLog(
      {
        ...labels,
        ...this.baseLabels,
      },
      this.subject,
      this.channel
    );
  }
}

export const log = new ExtensionsLog();
