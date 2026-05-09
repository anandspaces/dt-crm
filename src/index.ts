import express from "express";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const port = Number(process.env.PORT);

app.use(express.json());

app.get("/", (_request, response) => {
  response.json({
    message: "Express server is running",
  });
});

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
