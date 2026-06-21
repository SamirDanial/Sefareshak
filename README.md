# NEXT FOODY Restaurant App

A full-stack restaurant application with React frontend and Node.js backend.

## 🏗️ Project Structure

```
restaurent/
├── backend/          # Node.js + Express + Prisma backend
├── frontend/         # React + Vite + TypeScript frontend
├── .gitignore        # Git ignore rules
└── README.md         # This file
```

## 🚀 Quick Start

### Prerequisites
- Node.js (v18 or higher)
- PostgreSQL database
- npm or yarn

### Backend Setup

1. Navigate to backend directory:
   ```bash
   cd backend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   ```bash
   cp .env.example .env
   # Edit .env with your database URL and Clerk configuration
   ```

4. Set up the database:
   ```bash
   npx prisma generate
   npx prisma db push
   npx prisma db seed
   ```

5. Start the development server:
   ```bash
   npm run dev
   ```

The backend will be available at `http://localhost:3000`

### Frontend Setup

1. Navigate to frontend directory:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   ```bash
   cp .env.example .env.local
   # Edit .env.local with your Clerk publishable key
   ```

4. Start the development server:
   ```bash
   npm run dev
   ```

The frontend will be available at `http://localhost:5173`

## 🛠️ Tech Stack

### Backend
- **Node.js** - Runtime environment
- **Express.js** - Web framework
- **TypeScript** - Type safety
- **Prisma** - Database ORM
- **PostgreSQL** - Database
- **Clerk** - Authentication
- **JWT** - Token-based auth

### Frontend
- **React 18** - UI library
- **TypeScript** - Type safety
- **Vite** - Build tool
- **React Router** - Routing
- **Tailwind CSS** - Styling
- **Shadcn/ui** - UI components
- **Zustand** - State management
- **Clerk** - Authentication

## 📁 Key Features

### Backend Features
- ✅ User authentication with Clerk
- ✅ Admin dashboard with CRUD operations
- ✅ Category management
- ✅ Meal management with sizes and add-ons
- ✅ Order management
- ✅ Database seeding with sample data
- ✅ TypeScript for type safety
- ✅ Prisma ORM for database operations

### Frontend Features
- ✅ Responsive design (mobile-first)
- ✅ Modern UI with pink/rose theme
- ✅ Real-time data from backend API
- ✅ Shopping cart functionality
- ✅ Meal customization page
- ✅ Category browsing
- ✅ User authentication
- ✅ Loading states and error handling
- ✅ Scroll-to-top navigation
- ✅ Smart back button behavior

## 🔧 Development Scripts

### Backend Scripts
```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run start        # Start production server
npm run db:push      # Push schema to database
npm run db:seed      # Seed database with sample data
npm run db:studio    # Open Prisma Studio
```

### Frontend Scripts
```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run preview      # Preview production build
npm run lint         # Run ESLint
npm run type-check   # Run TypeScript checks
```

## 🗄️ Database Schema

The application uses PostgreSQL with Prisma ORM. Key models include:

- **User** - User accounts and profiles
- **Category** - Food categories
- **Meal** - Individual food items
- **MealSize** - Different sizes for meals
- **MealAddOn** - Additional options for meals
- **Order** - Customer orders
- **OrderItem** - Individual items in orders

## 🔐 Authentication

The app uses Clerk for authentication:
- User registration and login
- Protected routes
- Admin role management
- JWT token handling

## 🎨 UI/UX Features

- **Responsive Design** - Works on all screen sizes
- **Dark Theme** - Modern dark interface
- **Pink/Rose Theme** - Consistent brand colors
- **Smooth Animations** - Hover effects and transitions
- **Loading States** - Skeleton animations
- **Error Handling** - User-friendly error messages
- **Navigation** - Intuitive routing and back buttons

## 📱 Pages

### Public Pages
- **Home** - Featured meals, categories, promotions
- **Menu** - Complete meal catalog
- **Category** - Meals within specific categories
- **Meal Customization** - Customize meal options

### Protected Pages
- **Cart** - Shopping cart
- **Checkout** - Order completion
- **Admin Dashboard** - Management interface

## 🚀 Deployment

### Backend Deployment
1. Build the application: `npm run build`
2. Set production environment variables
3. Deploy to your preferred platform (Vercel, Railway, Heroku, etc.)

### Frontend Deployment
1. Build the application: `npm run build`
2. Deploy the `dist` folder to your hosting platform
3. Configure environment variables

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Commit your changes: `git commit -m 'Add feature'`
4. Push to the branch: `git push origin feature-name`
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 🆘 Support

If you encounter any issues or have questions:
1. Check the documentation
2. Search existing issues
3. Create a new issue with detailed information

---

**Happy coding! 🍕✨**
