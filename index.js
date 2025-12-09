const express = require("express");
const app = express();
const port = 3000;
var cors = require("cors");
require("dotenv").config();
app.use(cors());
app.use(express.json());
var admin = require("firebase-admin");
const stripe = require("stripe")(process.env.STRIPE_API);
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
    const applicationCollection = db.collection("applications");

    const verifyJwt = async (req, res, next) => {
      const authorization = req.headers.authorization;
      if (!authorization) {
        return res.status(401).send({ message: "Unauthorized" });
      }
      const token = authorization.split(" ")[1];
      try {
        const decodedUser = await admin.auth().verifyIdToken(token);
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
    app.post("/scholarships", async (req, res) => {
      req.body.scholarshipPostDate = new Date();
      const result = await scholarshipsCollection.insertOne(req.body);

      res.send(result);
    });
    app.get("/adminScholarships", async (req, res) => {
      const result = await scholarshipsCollection.find().toArray();
      res.send(result);
    });
    app.get("/scholarships", async (req, res) => {
      try {
        const scholarships = await scholarshipsCollection.find().sort({ scholarshipPostDate: -1 }).toArray();

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
      const result = await scholarshipsCollection.find().sort({ universityWorldRank: -1 }).limit(6).toArray();
      res.send(result);
    });

    app.get("/scholarships/:id", async (req, res) => {
      const scholarship = await scholarshipsCollection.findOne({ _id: new ObjectId(req.params.id) });
      const reviewData = await reviewsCollection.findOne({ scholarshipId: req.params.id });
      res.send({ scholarship, reviewData });
    });
    app.patch("/scholarships/:id", async (req, res) => {
      const id = req.params.id;
      const updatedDoc = req.body;

      const result = await scholarshipsCollection.updateOne({ _id: new ObjectId(id) }, { $set: updatedDoc });
      res.send(result);
    });

    app.get("/applications", verifyJwt, async (req, res) => {
      const { email } = req.query;
      if (req.decodedUser.email !== email) {
        return res.status(401).send({ message: "Unauthorized" });
      } else {
        const result = await applicationCollection.find({ userEmail: email }).toArray();
        res.send(result);
      }
    });

    // STRIPE Api
    app.post("/create-checkout-session", async (req, res) => {
      const paymentInfo = req.body;
      const amount = (paymentInfo.serviceCharge + paymentInfo.applicationFees) * 100;
      const session = await stripe.checkout.sessions.create({
        line_items: [
          {
            // Provide the exact Price ID (for example, price_1234) of the product you want to sell
            price_data: {
              currency: "USD",
              unit_amount: amount,
              product_data: { name: paymentInfo.universityName },
            },
            quantity: 1,
          },
        ],
        customer_email: paymentInfo.userEmail,

        mode: "payment",
        metadata: {
          userEmail: paymentInfo.userEmail,
          scholarshipId: paymentInfo._id,
          userId: paymentInfo.userId,
          universityName: paymentInfo.universityName,
          scholarshipCategory: paymentInfo.scholarshipCategory,
          degree: paymentInfo.degree,
          applicationFees: paymentInfo.applicationFees,
          serviceCharge: paymentInfo.serviceCharge,
          applicationStatus: "pending",
          feedback: "",
          userName: paymentInfo.userName,
          universityCountry: paymentInfo.universityCountry,
        },
        success_url: `${process.env.SITE_DOMAIN}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.SITE_DOMAIN}/payment-error?apl_id=${paymentInfo._id}`,
      });
      res.send({ url: session.url });
    });

    // app.patch("/payment-success", async (req, res) => {
    //   const { update } = req.query;
    //   const sessionid = req.query.session_id;
    //   const email = req.query.email;
    //   const session = await stripe.checkout.sessions.retrieve(sessionid);
    //   const application = session.metadata;
    //   application.applicationStatus = "pending";
    //   application.paymentStatus = "paid";
    //   application.tnxId = session.payment_intent;
    //   const check = await applicationCollection.findOne({ tnxId: session.payment_intent });
    //   if (check) {
    //     console.log("already paid");
    //     return;
    //   }
    //   const checkForUpdate = await applicationCollection.findOne({ scholarshipId: session.scholarshipId, userEmail: session.userEmail });
    //   console.log(checkForUpdate);
    //   if (checkForUpdate) {
    //     const resut = await applicationCollection.updateOne(
    //       { scholarshipId: session.scholarshipId, userEmail: session.userEmail },
    //       {
    //         $set: {
    //           paymentStatus: "paid",
    //         },
    //       }
    //     );
    //     console.log(resut);
    //     res.send(resut);
    //   } else {
    //     const result = await applicationCollection.insertOne(application);
    //   }
    // });
    app.patch("/payment-success", async (req, res) => {
      try {
        const session_id = req.query.session_id;

        if (!session_id) {
          return res.status(400).send({ message: "Missing session_id" });
        }

        // Retrieve the Stripe session
        const session = await stripe.checkout.sessions.retrieve(session_id);

        if (!session) {
          return res.status(404).send({ message: "Stripe session not found" });
        }

        const metadata = session.metadata;

        // Convert fees to numbers
        const applicationFees = parseFloat(metadata.applicationFees);
        const serviceCharge = parseFloat(metadata.serviceCharge);

        const scholarshipId = metadata.scholarshipId; // stored as string

        // Build application data
        const applicationData = {
          scholarshipId,
          userId: metadata.userId,
          userName: metadata.userName,
          userEmail: metadata.userEmail,
          universityName: metadata.universityName,
          scholarshipCategory: metadata.scholarshipCategory,
          degree: metadata.degree,
          applicationFees,
          serviceCharge,
          applicationStatus: "pending",
          paymentStatus: "paid",
          tnxId: session.payment_intent,
          applicationDate: new Date(),
          feedback: "",
          universityCountry: metadata.universityCountry,
        };

        // 1️⃣ Check if payment already processed (prevent duplicates)
        const existingPayment = await applicationCollection.findOne({
          tnxId: session.payment_intent,
        });

        if (existingPayment) {
          return res.status(200).send({ message: "Payment already processed" });
        }

        // 2️⃣ Check if user already has an unpaid application for this scholarship

        const existingApplication = await applicationCollection.findOne({
          userEmail: metadata.userEmail,
          _id: new ObjectId(metadata.scholarshipId),
        });

        if (existingApplication) {
          // Update the unpaid application to mark it as paid
          const result = await applicationCollection.updateOne({ _id: existingApplication._id }, { $set: { paymentStatus: "paid", tnxId: session.payment_intent } });
          console.log(result);
          return res.status(200).send({
            message: "Application updated to paid",
            updatedId: existingApplication._id,
            result,
          });
        }

        // 3️⃣ If no application exists, insert a new one
        const result = await applicationCollection.insertOne(applicationData);

        return res.status(201).send({
          message: "Application created and marked as paid",
          insertedId: result.insertedId,
        });
      } catch (error) {
        console.error("Payment success error:", error);
        return res.status(500).send({ message: "Server error", error });
      }
    });

    app.post("/payment-error", verifyJwt, async (req, res) => {
      const apl_id = req.query.apl_id;
      const user = req.body;
      const scholarship = await scholarshipsCollection.findOne({ _id: new ObjectId(apl_id) });

      const info = {
        scholarshipId: scholarship._id.toString(),
        userId: user.uid,
        userName: user.name,
        userEmail: user.email,
        universityName: scholarship.universityName,
        scholarshipCategory: scholarship.scholarshipCategory,
        degree: scholarship.degree,
        applicationFees: scholarship.applicationFees,
        serviceCharge: scholarship.serviceCharge,
        applicationStatus: "pending",
        paymentStatus: "unpaid",
        applicationDate: new Date(),
        feedback: "",
        universityCountry: scholarship.universityCountry,
      };
      const id = scholarship._id.toString();
      const check = await applicationCollection.findOne({ userEmail: user.email, scholarshipId: id });
      if (check) {
        return;
      } else {
        const result = await applicationCollection.insertOne(info);
      }
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
