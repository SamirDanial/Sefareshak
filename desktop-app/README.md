# Bellami Desktop Application

A desktop application built with Electron, React, and TypeScript with Clerk authentication. **Only ADMIN users can access this application.**

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- Clerk account (for authentication)
- Backend API running (for user role verification)

### Installation

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file in the `desktop-app` directory with the following variables:

```env
# Clerk Authentication
# Get your publishable key from https://dashboard.clerk.com/
VITE_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_your_publishable_key_here

# API Configuration
# URL of your backend API
VITE_API_URL=http://localhost:3001
```

**Important:** Replace `pk_test_your_publishable_key_here` with your actual Clerk publishable key from your Clerk dashboard.

### Development

To run the application in development mode:

```bash
npm run dev
```

This will start the Vite dev server. In a separate terminal, run:

```bash
npm run electron:dev
```

Or use the combined command (requires `concurrently` and `wait-on`):

```bash
npm run electron:dev
```

### Building

Build the application for your current platform:

```bash
npm run build
```

Build for specific platforms:

```bash
npm run build:win    # Windows
npm run build:mac    # macOS
npm run build:linux  # Linux
```

The built installers will be in the `release` directory.

## Project Structure

```
desktop-app/
├── electron/          # Electron main process files
│   ├── main.ts       # Main Electron process
│   ├── preload.ts    # Preload script
│   └── build.mjs     # Build script for Electron files
├── src/              # React application source
│   ├── App.tsx       # Main React component
│   ├── main.tsx      # React entry point
│   └── index.css     # Global styles
├── dist/             # Built React app (generated)
├── dist-electron/    # Built Electron files (generated)
├── release/          # Built installers (generated)
└── package.json      # Project configuration
```

## Authentication

This application uses **Clerk** for authentication and **only allows ADMIN users** to access it.

### How it works:

1. Users must sign in using Clerk authentication
2. Upon sign-in, the app automatically registers the user with the backend API
3. The app fetches the user's role from the backend
4. **If the user is not an ADMIN, they are automatically logged out**
5. Only ADMIN users can proceed to use the application

### Security Features:

- **AdminGuard Component**: Automatically checks user role and logs out non-admin users
- **Role Verification**: User role is fetched from your backend API
- **Automatic Logout**: Non-admin users are logged out immediately upon detection

## Technologies

- **Electron**: Desktop application framework
- **React**: UI library
- **TypeScript**: Type safety
- **Vite**: Build tool and dev server
- **electron-builder**: Packaging and distribution
- **Clerk**: Authentication and user management

## Project Structure

```
desktop-app/
├── electron/              # Electron main process files
│   ├── main.ts           # Main Electron process
│   ├── preload.ts        # Preload script
│   └── build.mjs         # Build script for Electron files
├── src/                  # React application source
│   ├── components/       # React components
│   │   └── AdminGuard.tsx # Admin role guard component
│   ├── contexts/          # React contexts
│   │   └── AuthContext.tsx # Authentication context
│   ├── services/          # API services
│   │   └── apiService.ts  # Backend API service
│   ├── App.tsx            # Main React component
│   ├── main.tsx           # React entry point
│   └── index.css          # Global styles
├── dist/                  # Built React app (generated)
├── dist-electron/         # Built Electron files (generated)
├── release/               # Built installers (generated)
└── package.json           # Project configuration
```

## Next Steps

You can now customize the application by:

1. Adding more React components in `src/components/`
2. Extending Electron functionality in `electron/main.ts`
3. Adding IPC communication between main and renderer processes
4. Customizing the build configuration in `electron-builder.yml`
5. Integrating with your backend API for additional features

