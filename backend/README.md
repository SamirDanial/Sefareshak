# Restaurant Backend API

A robust Express.js backend API for a restaurant ordering system, built with TypeScript, PostgreSQL, Prisma ORM, and Clerk authentication.

## 🏗️ Architecture

- **Framework**: Express.js with TypeScript
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: Clerk OAuth
- **Design Pattern**: Singleton Pattern for database and app instances
- **Security**: Helmet, CORS, Rate Limiting
- **Validation**: Express Validator

## 🚀 Getting Started

### Prerequisites

- Node.js (v18 or higher)
- PostgreSQL database
- Clerk account for authentication

### Installation

1. **Install dependencies**:

   ```bash
   npm install
   ```

2. **Set up environment variables**:

   ```bash
   cp .env.example .env
   ```

   Update the `.env` file with your actual values:

   - Database URL
   - Clerk configuration (issuer URL, audience, secret key)
   - JWT secrets
   - Other configuration

3. **Set up Clerk authentication**:

   - Create a Clerk account at [clerk.com](https://clerk.com)
   - Create a new application
   - Copy the issuer URL, audience, and secret key to your `.env` file
   - Configure webhooks if needed (optional)

4. **Set up the database**:

   ```bash
   # Generate Prisma client
   npm run prisma:generate

   # Run database migrations
   npm run prisma:migrate

   # (Optional) Seed the database
   npm run prisma:seed
   ```

5. **Start the development server**:
   ```bash
   npm run dev
   ```

## 📁 Project Structure

```
backend/
├── src/
│   ├── config/          # Configuration files (Database, Clerk)
│   ├── controllers/     # Route controllers
│   ├── middleware/      # Custom middleware
│   ├── routes/          # API routes
│   ├── services/        # Business logic
│   ├── types/           # TypeScript type definitions
│   ├── utils/           # Utility functions
│   ├── app.ts           # Express app configuration
│   └── index.ts         # Application entry point
├── prisma/
│   ├── schema.prisma    # Database schema
│   └── migrations/      # Database migrations
├── .env                 # Environment variables
├── tsconfig.json        # TypeScript configuration
└── package.json         # Dependencies and scripts
```

## 🛠️ Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build the project for production
- `npm start` - Start the production server
- `npm run prisma:generate` - Generate Prisma client
- `npm run prisma:migrate` - Run database migrations
- `npm run prisma:deploy` - Deploy migrations to production
- `npm run prisma:studio` - Open Prisma Studio
- `npm run prisma:seed` - Seed the database

## 🔧 Environment Variables

| Variable                | Description                          | Required           |
| ----------------------- | ------------------------------------ | ------------------ |
| `DATABASE_URL`          | PostgreSQL connection string         | Yes                |
| `CLERK_ISSUER_URL`      | Clerk issuer URL                     | Yes                |
| `CLERK_AUDIENCE`        | Clerk audience identifier            | Yes                |
| `CLERK_SECRET_KEY`      | Clerk secret key                     | Yes                |
| `CLERK_PUBLISHABLE_KEY` | Clerk publishable key                | No                 |
| `CLERK_WEBHOOK_SECRET`  | Clerk webhook secret                 | No                 |
| `JWT_SECRET`            | JWT signing secret                   | Yes                |
| `PORT`                  | Server port                          | No (default: 3001) |
| `NODE_ENV`              | Environment (development/production) | No                 |
| `FRONTEND_URL`          | Frontend URL for CORS                | Yes                |

## 🗄️ Database Schema

The database includes the following main entities:

- **Users** - User accounts (linked to Clerk)
- **Categories** - Meal categories
- **Meals** - Individual menu items
- **MealSizes** - Size options for meals
- **MealAddOns** - Add-on options for meals
- **Orders** - Customer orders
- **OrderItems** - Individual items in orders
- **OrderItemAddOns** - Add-ons for order items

## 🔐 Authentication & Authorization

The API uses Clerk for authentication with role-based access control:

### User Roles

- **USER**: Regular customers who can place orders and manage their profile
- **ADMIN**: Restaurant staff who can manage all aspects of the system

### Authentication Features

- User registration and login via Clerk
- Guest orders (no authentication required)
- Role-based route protection
- Admin-only endpoints
- User profile management

### Protected Routes

- **Admin Routes** (`/api/admin/*`): Require ADMIN role
- **User Routes** (`/api/user/*`): Some require authentication, some are public
- **Public Routes**: Categories, meals (read-only)

## 📡 API Endpoints

### Health Check

- `GET /health` - Server health status

### API Info

- `GET /api` - API information and available endpoints

### Public Endpoints

- `GET /api/user/categories` - Get all categories
- `GET /api/user/categories/:id` - Get category by ID
- `GET /api/user/meals` - Get all meals
- `GET /api/user/meals/:id` - Get meal by ID

### User Endpoints (Authentication Required)

- `GET /api/user/profile` - Get user profile
- `PUT /api/user/profile` - Update user profile
- `GET /api/user/orders` - Get user orders
- `POST /api/user/orders` - Create new order
- `GET /api/user/orders/:id` - Get specific order
- `PUT /api/user/orders/:id/cancel` - Cancel order

### Admin Endpoints (Admin Role Required)

- `GET /api/admin/dashboard` - Admin dashboard
- `GET /api/admin/users` - Get all users
- `GET /api/admin/users/:id` - Get user by ID
- `PUT /api/admin/users/:id` - Update user
- `DELETE /api/admin/users/:id` - Delete user
- `GET /api/admin/categories` - Manage categories
- `POST /api/admin/categories` - Create category
- `PUT /api/admin/categories/:id` - Update category
- `DELETE /api/admin/categories/:id` - Delete category
- `GET /api/admin/meals` - Manage meals
- `POST /api/admin/meals` - Create meal
- `PUT /api/admin/meals/:id` - Update meal
- `DELETE /api/admin/meals/:id` - Delete meal
- `GET /api/admin/orders` - Get all orders
- `GET /api/admin/orders/:id` - Get order by ID
- `PUT /api/admin/orders/:id` - Update order status
- `DELETE /api/admin/orders/:id` - Delete order
- `GET /api/admin/analytics` - Get analytics
- `GET /api/admin/analytics/revenue` - Revenue analytics
- `GET /api/admin/analytics/orders` - Order analytics

## 🛡️ Security Features

- **Helmet**: Security headers
- **CORS**: Cross-origin resource sharing
- **Rate Limiting**: Request rate limiting
- **Input Validation**: Request validation
- **SQL Injection Protection**: Prisma ORM
- **Authentication**: Clerk OAuth

## 🚀 Deployment

1. **Build the project**:

   ```bash
   npm run build
   ```

2. **Set production environment variables**

3. **Deploy database migrations**:

   ```bash
   npm run prisma:deploy
   ```

4. **Start the production server**:
   ```bash
   npm start
   ```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the ISC License.
