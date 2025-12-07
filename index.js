const express = require("express");
const app = express();
const port = 3000;
var cors = require("cors");
require("dotenv").config();
app.use(cors());
app.use(express.json());
var admin = require("firebase-admin");

var serviceAccount = require("./scholarlink-9240a.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

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
    const usersCollection = db.collection("users");

    const verifyJwt = async (req, res, next) => {
      const authorization = req.headers.authorization;
      if (!authorization) {
        return res.status(401).send({ message: "Unauthorized" });
      }
      const token = authorization.split(" ")[1];
      try {
        const decodedUser = await admin.auth().verifyIdToken(token);
        console.log(decodedUser);
        req.decodedUser = decodedUser;
      } catch (error) {
        return res.status(401).send({ message: "Unauthorized" });
      }
      next();
    };

    const verifyAdmin = (req, res, next) => {
      next();
    };

    // usersapi
    app.get("/users", async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });
    app.get("/user/info", verifyJwt, async (req, res) => {
      const { email } = req.query;
      const result = await usersCollection.findOne({ email: email });
      res.send(result);
    });
    app.get("/users/:email/role", async (req, res) => {
      const { email } = req.params;
      console.log(email);
      const result = await usersCollection.findOne({ email: email });
      res.send({ role: result.role });
    });
    app.patch("/user/:email/role", verifyJwt, verifyAdmin, async (req, res) => {
      const userInfo = req.body;
      console.log(req.body);
      const result = await usersCollection.updateOne(
        { email: userInfo.email },
        {
          $set: {
            role: userInfo.role,
          },
        }
      );
      res.send(result);
    });

    app.post("/user/auth", async (req, res) => {
      const userInfo = req.body;
      userInfo.role = "student";
      const userexist = await usersCollection.findOne({ email: userInfo.email });
      if (userexist) {
        return res.send({ message: "user Already Exixts" });
      } else {
        const result = await usersCollection.insertOne(userInfo);
        res.send(result);
      }
    });

    // schoalarships api
    app.get("/scholarships", async (req, res) => {
      try {
        const scholarships = await scholarshipsCollection.find().toArray();

        const countries = [...new Set(scholarships.map((s) => s.universityCountry).filter(Boolean))];
        const categories = [...new Set(scholarships.map((s) => s.scholarshipCategory).filter(Boolean))];

        res.send({
          success: true,
          data: scholarships,
          filters: {
            countries: ["All", ...countries],
            categories: ["All", ...categories],
          },
        });
      } catch (error) {
        console.error("Error:", error);
        res.status(500).send({ success: false, message: error.message });
      }
    });

    app.get("/scholarships/filters", async (req, res) => {
      try {
        const allScholarships = await scholarshipsCollection
          .find()
          .sort({
            scholarshipPostDate: -1,
          })
          .toArray();
        const countries = [...new Set(allScholarships.map((s) => s.universityCountry).filter(Boolean))];
        const categories = [...new Set(allScholarships.map((s) => s.scholarshipCategory).filter(Boolean))];
        const subjects = [...new Set(allScholarships.map((s) => s.subjectCategory).filter(Boolean))];

        res.send({
          success: true,
          countries: ["All", ...countries.sort()],
          categories: ["All", ...categories.sort()],
          subjects: ["All", ...subjects.sort()],
        });
      } catch (error) {
        res.status(500).send({ success: false, message: "Error fetching filter options" });
      }
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
