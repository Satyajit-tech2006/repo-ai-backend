import app from './app';

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`[Repo AI Server] Running on http://localhost:${PORT}`);
  console.log(`- GET  /api/features`);
  console.log(`- POST /api/features/search`);
  console.log(`- POST /api/features/index`);
  console.log(`- POST /api/features/compatibility`);
  console.log(`- POST /api/features/extract`);
  console.log('- GET  /api/jobs');
  console.log('- GET  /api/jobs/:id');
});