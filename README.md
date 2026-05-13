# Music-Wails

## About the Project

Music-Wails is a desktop application developed using the Wails framework, integrating a robust Go backend with a modern React and TypeScript frontend.

## Features

- **Cross-Platform Compatibility**: Built to run natively across different operating systems using Wails.
- **Modern Frontend**: Utilizes React and TypeScript for a responsive, maintainable, and scalable user interface.
- **Dynamic User Interface**: Incorporates advanced frontend packages (such as image color extraction) for an immersive media experience.
- **High Performance**: Leverages the Go programming language for fast and efficient backend processing.

## Prerequisites

Before you begin, ensure you have the following installed on your system:
- Go (version 1.18 or later recommended)
- Node.js and npm (or your preferred Node package manager)
- Wails CLI

## Getting Started

### Configuration

You can configure the project settings by modifying the `wails.json` file. For comprehensive details on project configuration, please refer to the official Wails documentation.

### Live Development

To run the application in live development mode, execute the following command in the root directory of the project:

    wails dev

This command starts a Vite development server that provides rapid hot-reloading for any modifications made to the frontend. If you prefer to develop directly in a web browser while maintaining access to your Go methods, a secondary development server is available at `http://localhost:34115`. Connecting to this address allows you to invoke Go functions directly from the browser's developer tools.

### Building for Production

To compile a redistributable, production-ready package, run the following command:

    wails build

The compiled binary will be placed in the standard build output directory, ready for deployment.
