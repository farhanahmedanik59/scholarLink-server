const express = require("express");
const app = express();
const port = 3000;
var cors = require("cors");
require("dotenv").config();
app.use(cors());
app.use(express.json());
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster1.gq2vs5u.mongodb.net/?appName=Cluster1`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});
async function run() {
  try {
    const db = client.db("scholarlink");
    const scholarshipsCollection = db.collection("scholarships");
    const reviewsCollection = db.collection("reviews");

    // scholarships api
    app.get("/scholarships", async (req, res) => {
      const query = {};
      const result = await scholarshipsCollection.find(query).toArray();
      res.send(result);
    });

    app.get("/scholarships/top", async (req, res) => {
      const result = await scholarshipsCollection.find().sort({ createdAt: -1 }).limit(6).toArray();
      res.send(result);
    });

    app.get("/scholarships/:id", async (req, res) => {
      const scholarship = await scholarshipsCollection.findOne({ _id: new ObjectId(req.params.id) });
      const reviewData = await reviewsCollection.findOne({ scholarshipId: req.params.id });
      res.send({ scholarship, reviewData });
    });

    await client.connect();
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
