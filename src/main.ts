import { Application } from './runtime/Application';

const application = new Application(document.getElementById('game') as HTMLCanvasElement);
if (import.meta.env.DEV) {
  (window as unknown as { __retro: unknown }).__retro = {
    app: application,
    get game() { return application.session?.game; },
    get input() { return application.session?.input; },
    get autopilot() { return application.session?.autopilot; },
    get readyAtMs() { return application.readyAtMs; },
    debug: application.debug,
    applySettings: application.applySettings.bind(application),
  };
  import.meta.hot?.dispose(() => void application.dispose());
}
