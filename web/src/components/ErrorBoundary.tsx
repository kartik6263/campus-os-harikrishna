import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Changing this clears a caught error — e.g. the screen the user moved to. */
  resetKey?: unknown;
  /** Where "Go back" leads. */
  onHome?: () => void;
}

interface State { error: Error | null; resetKey?: unknown }

/**
 * Keeps one broken screen from blanking the whole application. The user sees
 * what happened and can retry or leave, and the error is logged for support;
 * everything outside the boundary (navigation, the switcher) keeps working.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, resetKey: this.props.resetKey };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    // Moving to another screen gives it a fresh start.
    return props.resetKey !== state.resetKey ? { error: null, resetKey: props.resetKey } : null;
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[CampusOS] screen crashed', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6 bg-[#EDEFF3]">
        <div className="bg-white border border-[#D3D8E0] rounded-[4px] max-w-md w-full p-6 text-center">
          <p className="text-[16px] font-semibold text-[#16264A]">This screen ran into a problem</p>
          <p className="text-[13px] text-[#5A6577] mt-2">
            Your data is safe — nothing was lost. Try again, and if it keeps happening, tell your IT Cell what you were doing.
          </p>
          <p className="text-[11px] text-[#5A6577] font-mono mt-3 break-words">{error.message}</p>
          <div className="flex gap-2 justify-center mt-5">
            <button onClick={() => this.setState({ error: null })} className="h-9 px-4 text-[13px] font-medium bg-[#16264A] text-white rounded-[4px] cursor-pointer hover:bg-[#0F1C38]">Try again</button>
            {this.props.onHome && (
              <button onClick={() => { this.setState({ error: null }); this.props.onHome!(); }} className="h-9 px-4 text-[13px] font-medium border border-[#D3D8E0] text-[#16264A] rounded-[4px] cursor-pointer hover:bg-[#EDEFF3]">Go to my workspace</button>
            )}
          </div>
        </div>
      </div>
    );
  }
}
