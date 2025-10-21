# Contributing to OpenTrain Editor

Thank you for your interest in contributing! This document outlines the process for reporting issues, suggesting enhancements, and submitting pull requests.

## Code of Conduct

By participating you agree to uphold the [Code of Conduct](CODE_OF_CONDUCT.md). Please report unacceptable behavior to `opensource@opentrain.ai`.

## Getting Started

1. Fork the repository and clone your fork.
2. Create a feature branch: `git checkout -b feature/my-update`.
3. Make your changes following the style conventions described in the repository.
4. Run any relevant tests or lint steps (for this static project, verify the editor loads locally).
5. Commit with clear messages and open a pull request against `main`.

## Reporting Issues

- Use the issue tracker to report bugs or request features.
- Include reproduction steps, expected behavior, and screenshots or logs when possible.
- Label issues appropriately (`bug`, `enhancement`, `documentation`).

## Pull Request Guidelines

- Keep changes focused. Separate unrelated fixes into multiple PRs.
- Update documentation and comments alongside code changes.
- Ensure CI (if configured) passes before requesting review.
- Reference related issues in the PR description (e.g., `Closes #123`).

## Development Tips

- Serve the `public/` directory locally using any static server (e.g., `npx serve public`).
- Use browser dev tools to inspect `postMessage` traffic.
- Document future improvements in the `docs/` folder for easy onboarding.

We appreciate your contributions to OpenTrain Editor!
