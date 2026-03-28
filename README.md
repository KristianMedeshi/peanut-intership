# 🚀 TypeScript Project Baseline

A robust and clean TypeScript project template featuring a simple Express.js server, pre-configured with essential tools for high-quality development.

[![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/docs/)
[![Express.js](https://img.shields.io/badge/express.js-%23404d59.svg?style=for-the-badge&logo=express&logoColor=%2361DAFB)](https://expressjs.com/)
[![Node.js](https://img.shields.io/badge/Node.js-6DA55F?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org/en/docs/)
[![Vitest](https://img.shields.io/badge/vitest-6E9F18?style=for-the-badge&logo=vitest&logoColor=white)](https://vitest.dev/)
[![Prettier](https://img.shields.io/badge/prettier-1A2C34?style=for-the-badge&logo=prettier&logoColor=F7BA3E)](https://prettier.io/docs/en/)
[![ESLint](https://img.shields.io/badge/eslint-3A33D1?style=for-the-badge&logo=eslint&logoColor=white)](https://eslint.org/docs/latest/)

---

## 📋 Table of Contents

- [🚀 TypeScript Project Baseline](#-typescript-project-baseline)
  - [📋 Table of Contents](#-table-of-contents)
  - [📂 Project Structure](#-project-structure)
  - [✅ Prerequisites](#-prerequisites)
  - [🚀 Getting Started](#-getting-started)
  - [🛠️ Available Commands](#️-available-commands)

---

## <a id="project-structure"></a>📂 Project Structure

The repository is organized to separate concerns, making it scalable and easy to navigate.

```
/
├── configs/              # Project-wide or tool-specific configurations.
├── docs/                 # Documentation files.
├── scripts/              # Standalone utility scripts.
├── src/                  # Main application source code.
└── tests/                # Test files.
```

## <a id="prerequisites"></a>✅ Prerequisites

Before you begin, ensure you have the following installed on your system:
- [Node.js](https://nodejs.org/) (LTS version recommended)
- [npm](https://www.npmjs.com/) (which comes bundled with Node.js)

## <a id="getting-started"></a>🚀 Getting Started

Follow these steps to get your development environment up and running.

1.  **Clone the Repository**
    ```bash
    git clone <repository-url>
    cd <repository-name>
    ```

2.  **Install Dependencies**
    ```bash
    npm install
    ```
    *This also runs the `prepare` script to set up Git hooks.*

3.  **Configure Your Environment**
    Create a `.env` file by copying the example. You can customize the `PORT` here.
    ```bash
    cp .env.example .env
    ```

4.  **Run the Development Server**
    ```bash
    npm run dev
    ```
    You should see the server start on the configured port (default: 3000).

## <a id="available-commands"></a>🛠️ Available Commands

This project comes with a set of useful scripts to streamline your development workflow.

```bash
npm run dev            # Starts the server in development mode with hot-reloading
```

```bash
npm run build          # Compiles TypeScript into production-ready JavaScript (dist/)
```

```bash
npm run start          # Starts the production server (requires build first)
```

```bash
npm run start:all      # Runs tests, builds, and starts the production server
```

```bash
npm test               # Runs the full test suite once
```

```bash
npm run test:watch     # Runs tests in watch mode
```

```bash
npm run test:coverage  # Runs tests and generates coverage report
```

```bash
npm run lint           # Lints code for style issues and errors
```
