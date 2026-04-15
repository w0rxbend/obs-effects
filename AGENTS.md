# Conventional Commits

This project follows [Conventional Commits](https://www.conventionalcommits.org/) for commit messages.

## Format

```
<type>(<scope>): <subject>

<body>
```

## Types

- **feat**: A new feature
- **fix**: A bug fix
- **chore**: Build process, dependencies, tooling
- **docs**: Documentation changes
- **style**: Code style changes (formatting, semicolons)
- **refactor**: Code refactoring without feature changes
- **perf**: Performance improvements
- **test**: Adding or updating tests

## Examples

```
feat(canvas): add sprite rendering support

Implemented WebGL sprite rendering with batch optimization.
```

```
chore(deps): update pixi.js to v8.0.0
```

```
fix(physics): resolve collision detection bug

Fixes #123
```

## Scope (Optional)

Specify the module or component affected (e.g., `canvas`, `loader`, `physics`).

## Body (Optional)

Provide detailed explanation of changes and motivation.

## Scope Notes

- Never analyze or traverse `node_modules` directory
- Always ignore and skip `node_modules` when gathering context
- Exclude `node_modules` from all file scanning operations

## PixiJS Best Practices

- Use **typed containers** for better performance and maintainability
- Leverage **display lists** efficiently; batch similar objects together
- Implement **object pooling** for frequently created/destroyed entities
- Use **masks and filters** sparingly; they impact performance
- Optimize **texture atlases** to reduce draw calls
- Enable **antialiasing** only when necessary
- Use **PIXI.Container** for grouping related sprites
- Cache **static graphics** as textures to improve rendering speed
- Profile with DevTools to identify bottlenecks

## TypeScript Guidelines

- Define types for custom sprites and containers
- Use strict mode (`"strict": true` in `tsconfig.json`)
- Leverage generics for reusable component patterns