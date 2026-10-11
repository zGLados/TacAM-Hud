# Contributing to TacAM HUD

TacAM HUD is a free tool for the CS2 community – no paid tier, no donations, no business behind it. It gets better when the people who run community broadcasts shape it. **You don't need to write code to help.**

By taking part you agree to the [Code of Conduct](CODE_OF_CONDUCT.md): be kind, assume good intent, help newcomers.

## Ways to help

| You can… | How |
|---|---|
| **Report a bug** | [Bug report form](https://github.com/zGLados/TacAM-Hud/issues/new?template=bug_report.yml) – or *Report a problem* in the app, which fills in your version. Steps to reproduce and a screenshot help most. |
| **Suggest or discuss an idea** | [Discussions → Ideas](https://github.com/zGLados/TacAM-Hud/discussions/categories/ideas). Upvote the ideas you want; well-defined ones become issues. |
| **Ask a question** | [Discussions → Q&A](https://github.com/zGLados/TacAM-Hud/discussions/categories/q-a) – your answer helps the next person too. |
| **Show your broadcast** | [Discussions → Show and tell](https://github.com/zGLados/TacAM-Hud/discussions/categories/show-and-tell): a link to your stream or VOD, a screenshot, your theme. Showcases may appear on [hud.tac.am](https://hud.tac.am). |
| **Test** | Try a release with your setup (OBS, Stream Deck, GOTV, an imported HUD) and tell us what worked and what didn't. Post it in [Discussions](https://github.com/zGLados/TacAM-Hud/discussions) – also "everything works". |
| **Write guides** | Setup guides, videos or tips for tournaments and LANs – in `docs/` or linked from a discussion. |
| **Translate** | The website, the docs – later the app. |
| **Write code** | Pick something from the [roadmap](https://hud.tac.am/#roadmap) or an open issue, or fix what bugs you – see below. |

## Contributing code

1. **Talk first for bigger changes.** Comment on the issue (or open one) so we agree on the approach before you invest time. Small fixes can go straight to a pull request.
2. **Set up** – Node.js ≥ 22.12 and npm ≥ 11:
   ```bash
   git clone https://github.com/zGLados/TacAM-Hud.git
   cd TacAM-Hud
   npm install
   npm run dev      # server + HUD + control panel with hot reload
   ```
   The built-in **demo match** (control panel → Live) feeds the HUD without CS2. More in [docs/development.md](docs/development.md); the code map is in [docs/architecture.md](docs/architecture.md).
3. **Before the pull request:**
   ```bash
   npm run typecheck
   npm test
   ```
   CI runs both on Linux and Windows for every pull request.
4. **Keep the docs current in the same pull request:** README feature list, `docs/features.md`, `docs/api.md` and `docs/architecture.md` where your change touches them; screenshots when the UI changes visibly. Add a line under *Unreleased* in `CHANGELOG.md` for anything users notice.

### Conventions

- TypeScript everywhere. **UI texts, docs and code comments are English.** Comments are sparse and explain *why*.
- Server input is validated with a zod schema in `apps/server/src/api.ts`.
- HUD CSS: BEM in kebab-case, colors only via `--color-*` variables – see [docs/hud-styling.md](docs/hud-styling.md).
- One topic per pull request; a clear title (`feat: …`, `fix: …`, `docs: …`) helps the changelog.

### AI-assisted contributions

TacAM HUD itself is developed with the help of AI, so AI-assisted contributions are welcome. You are responsible for what you submit: understand it, test it, and keep it focused.

## License

TacAM HUD is licensed under [GPL-3.0-only](LICENSE). By contributing you agree that your contribution is published under the same license. Only add third-party code or assets whose license allows it, and list them in [THIRD_PARTY.md](THIRD_PARTY.md).
