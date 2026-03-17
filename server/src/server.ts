import express from 'express';
import nodesRouter from './routes/nodes';
import edgesRouter from './routes/edges';

const app = express();

app.use(express.json());

app.use('/nodes', nodesRouter);
app.use('/edges', edgesRouter);

app.listen(3001, () => {
  console.log('Server on :3001');
});
