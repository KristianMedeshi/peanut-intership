import express from 'express';
import * as dotenv from 'dotenv';

dotenv.config();

const port = process.env.PORT || 3000;

const app = express();

app.use(express.json());

app.get('/', (_req, res) => {
  res.status(200).send('Hello World!');
});

app.use((_req, res) => {
  res.status(404).send('Not Found');
});

const server = app.listen(port, () => {
  console.log(`Server is listening on port ${port}`);
});

export { app, server };
