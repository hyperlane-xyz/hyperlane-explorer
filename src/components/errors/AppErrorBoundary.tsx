import type { ErrorInfo, PropsWithChildren, ReactNode } from 'react';
import { Component as ReactComponent } from 'react';

import { links } from '../../consts/links';
import { logger } from '../../utils/logger';

type State = { hasError: boolean };

export class AppErrorBoundary extends ReactComponent<PropsWithChildren, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logger.error('Unhandled app error', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
          <h1 className="text-2xl font-medium text-black">Something went wrong</h1>
          <a
            href={links.help}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 text-sm underline underline-offset-2"
          >
            Visit the Hyperlane Help Center
          </a>
        </div>
      );
    }

    return this.props.children as ReactNode;
  }
}
