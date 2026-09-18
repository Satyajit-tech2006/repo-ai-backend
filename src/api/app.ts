import express from 'express';
import featureRoutes from './routes/feature.route';
import { errorHandler } from './middlewares/error.middleware';

const app = express();

app.use(express.json());

// API Base Routes
app.use('/api/features', featureRoutes);

// Global Error Handler
app.use(errorHandler);

export default app;