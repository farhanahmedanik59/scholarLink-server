const express = require("express");
const app = express();
const port = 4000;
var cors = require("cors");
require("dotenv").config();
app.use(cors());
app.use(express.json());
var admin = require("firebase-admin");
const stripe = require("stripe")(process.env.STRIPE_API);
const decoded = Buffer.from(process.env.FB_TOKEN, "base64").toString("utf8");
var serviceAccount = JSON.parse(decoded);
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

    const verifyAdmin = async (req, res, next) => {
      const { email } = req.decodedUser;
      const result = await usersCollection.findOne({ email: email });
      if (result.role !== "admin") {
        return res.status(401).send({ message: "Unauthorize" });
      }
      next();
    };

    const verifyModerator = async (req, res, next) => {
      const { email } = req.decodedUser;
      const result = await usersCollection.findOne({ email: email });
      if (result.role !== "moderator") {
        return res.status(401).send({ message: "Unauthorize" });
      }
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
    app.delete("/users/:id", verifyJwt, verifyAdmin, async (req, res) => {
      const result = await usersCollection.deleteOne({ _id: new ObjectId(req.params.id) });
      res.send(result);
    });
    app.get("/users/:email/role", async (req, res) => {
      const { email } = req.params;
      const result = await usersCollection.findOne({ email: email });
      res.send({ role: result.role });
    });
    app.patch("/user/:email/role", verifyJwt, verifyAdmin, async (req, res) => {
      const userInfo = req.body;
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
    app.post("/scholarships", verifyJwt, verifyAdmin, async (req, res) => {
      req.body.scholarshipPostDate = new Date();
      const result = await scholarshipsCollection.insertOne(req.body);

      res.send(result);
    });
    app.get("/adminScholarships", verifyJwt, verifyAdmin, async (req, res) => {
      const result = await scholarshipsCollection.find().sort({ scholarshipPostDate: -1 }).toArray();
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
      const result = await scholarshipsCollection
        .find()
        .sort({
          applicationFees: 1,
        })
        .limit(6)
        .toArray();
      res.send(result);
    });

    app.get("/scholarship/:id/payment", verifyJwt, async (req, res) => {
      const result = await scholarshipsCollection.findOne({ _id: new ObjectId(req.params.id) });
      res.send(result);
    });
    app.get("/scholarships/:id", async (req, res) => {
      const scholarship = await scholarshipsCollection.findOne({ _id: new ObjectId(req.params.id) });
      const reviewData = await reviewsCollection.find({ scholarshipId: req.params.id }).toArray();
      res.send({ scholarship, reviewData });
    });
    app.patch("/scholarships/:id", verifyJwt, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const updatedDoc = req.body;
      const result = await scholarshipsCollection.updateOne({ _id: new ObjectId(id) }, { $set: updatedDoc });
      res.send(result);
    });
    app.delete("/scholarships/:id", verifyJwt, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const result = await scholarshipsCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    // applications api
    app.get("/applications", verifyJwt, async (req, res) => {
      const { email } = req.query;
      if (email) {
        if (req.decodedUser.email !== email) {
          return res.status(401).send({ message: "Unauthorized" });
        } else {
          const result = await applicationCollection.find({ userEmail: email }).toArray();
          res.send(result);
        }
      } else {
        const result = await applicationCollection.find().toArray();
        res.send(result);
      }
    });
    app.delete("/applications", verifyJwt, async (req, res) => {
      const { id } = req.query;
      result = await applicationCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    app.patch("/applications/:id", verifyJwt, verifyModerator, async (req, res) => {
      const id = req.params.id;
      const updatedDoc = req.body;
      const result = await applicationCollection.updateOne(
        { _id: new ObjectId(id) },
        {
          $set: updatedDoc,
        }
      );
      res.send(result);
    });

    app.get("/analytics", verifyJwt, verifyAdmin, async (req, res) => {
      try {
        const application = await applicationCollection.countDocuments();
        const users = await usersCollection.countDocuments();
        const scholarships = await scholarshipsCollection.countDocuments();
        const reviews = await reviewsCollection.countDocuments();

        const paidApplications = await applicationCollection.find({ paymentStatus: "paid" }).toArray();
        let totalFees = 0;
        paidApplications.forEach((app) => {
          totalFees += (app.applicationFees || 0) + (app.serviceCharge || 0);
        });
        res.send({
          application,
          users,
          scholarships,
          reviews,
          totalFees,
        });
      } catch (error) {
        res.status(500).send({ error: "Failed to fetch analytics" });
      }
    });

    app.get("/analytics/charts", verifyJwt, verifyAdmin, async (req, res) => {
      try {
        const applications = await applicationCollection.find().toArray();
        const scholarshipIds = applications.map((app) => app.scholarshipId);
        const scholarships = await scholarshipsCollection
          .find({
            _id: { $in: scholarshipIds.map((id) => new ObjectId(id)) },
          })
          .toArray();
        const universityApplications = {};
        applications.forEach((app) => {
          const scholarship = scholarships.find((s) => s._id.toString() === app.scholarshipId);
          if (scholarship) {
            const uniName = scholarship.universityName;
            universityApplications[uniName] = (universityApplications[uniName] || 0) + 1;
          }
        });
        const applicationsByUniversity = Object.entries(universityApplications)
          .map(([name, count]) => ({
            name,
            applications: count,
          }))
          .slice(0, 10);
        const applicationsByCategory = {};
        applications.forEach((app) => {
          const scholarship = scholarships.find((s) => s._id.toString() === app.scholarshipId);
          if (scholarship) {
            const category = scholarship.scholarshipCategory || "Unknown";
            applicationsByCategory[category] = (applicationsByCategory[category] || 0) + 1;
          }
        });
        const applicationsByCategoryData = Object.entries(applicationsByCategory).map(([name, value]) => ({
          name,
          value,
        }));
        const monthlyData = await applicationCollection
          .aggregate([
            {
              $group: {
                _id: {
                  year: { $year: "$applicationDate" },
                  month: { $month: "$applicationDate" },
                },
                count: { $sum: 1 },
              },
            },
            { $sort: { "_id.year": 1, "_id.month": 1 } },
            { $limit: 6 },
          ])
          .toArray();
        const monthlyTrend = monthlyData.map((item) => ({
          month: `${item._id.year}-${item._id.month}`,
          applications: item.count,
        }));
        res.send({
          applicationsByUniversity,
          applicationsByCategory: applicationsByCategoryData,
          monthlyTrend,
          totalApplications: applications.length,
          paidApplications: applications.filter((app) => app.paymentStatus === "paid").length,
        });
      } catch (error) {
        res.status(500).send({ error: "Failed to fetch chart data" });
      }
    });

    app.get("/analytics/detailed", verifyJwt, verifyAdmin, async (req, res) => {
      try {
        const applications = await applicationCollection.find().toArray();
        const scholarshipIds = [...new Set(applications.map((app) => app.scholarshipId))];
        const scholarships = await scholarshipsCollection
          .find({
            _id: { $in: scholarshipIds.map((id) => new ObjectId(id)) },
          })
          .toArray();

        const statusBreakdown = {};
        applications.forEach((app) => {
          const status = app.applicationStatus || "pending";
          statusBreakdown[status] = (statusBreakdown[status] || 0) + 1;
        });
        const paymentBreakdown = {};
        applications.forEach((app) => {
          const status = app.paymentStatus || "unpaid";
          paymentBreakdown[status] = (paymentBreakdown[status] || 0) + 1;
        });
        const scholarshipAppCount = {};
        applications.forEach((app) => {
          const scholarship = scholarships.find((s) => s._id.toString() === app.scholarshipId);
          if (scholarship) {
            const name = scholarship.scholarshipName;
            scholarshipAppCount[name] = (scholarshipAppCount[name] || 0) + 1;
          }
        });

        const topScholarships = Object.entries(scholarshipAppCount)
          .map(([name, count]) => ({ name, applications: count }))
          .sort((a, b) => b.applications - a.applications)
          .slice(0, 5);

        const recentApplications = await applicationCollection.find().sort({ applicationDate: -1 }).limit(5).toArray();
        const totalFees = applications.reduce((sum, app) => {
          return sum + (app.applicationFees || 0) + (app.serviceCharge || 0);
        }, 0);

        const avgFeePerApplication = applications.length > 0 ? (totalFees / applications.length).toFixed(2) : 0;

        res.send({
          statusBreakdown,
          paymentBreakdown,
          topScholarships,
          recentApplications: recentApplications.map((app) => ({
            userName: app.userName,
            universityName: app.universityName,
            status: app.applicationStatus,
            paymentStatus: app.paymentStatus,
            date: app.applicationDate,
            fees: (app.applicationFees || 0) + (app.serviceCharge || 0),
          })),
          totals: {
            totalFees,
            avgFeePerApplication,
            totalPaid: applications.filter((app) => app.paymentStatus === "paid").length,
            totalPending: applications.filter((app) => app.applicationStatus === "pending").length,
          },
        });
      } catch (error) {
        res.status(500).send({ error: "Failed to fetch detailed analytics" });
      }
    });

    // reviews api
    app.post("/reviews", verifyJwt, async (req, res) => {
      const review = req.body;
      review.reviewDate = new Date();
      result = await reviewsCollection.insertOne(review);
      res.send(result);
    });

    app.get("/reviews", verifyJwt, async (req, res) => {
      const { email } = req.query;
      if (req.decodedUser.email !== email) {
        return res.status(401).send({ message: "Unauthorized" });
      }
      const result = await reviewsCollection.find({ userEmail: email }).toArray();

      res.send(result);
    });

    app.patch("/reviews/:id", verifyJwt, async (req, res) => {
      const id = req.params.id;
      const result = await reviewsCollection.updateOne({ _id: new ObjectId(id) }, { $set: req.body });
      res.send(result);
    });
    app.get("/all/reviews", verifyJwt, verifyModerator, async (req, res) => {
      const result = await reviewsCollection.find().toArray();
      res.send(result);
    });

    app.delete("/all/reviews/:id", async (req, res) => {
      const id = req.params.id;
      const result = await reviewsCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    // STRIPE Api
    app.post("/create-checkout-session", verifyJwt, async (req, res) => {
      const paymentInfo = req.body;
      const amount = (paymentInfo.serviceCharge + paymentInfo.applicationFees) * 100;
      const session = await stripe.checkout.sessions.create({
        line_items: [
          {
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
          scholarshipName: paymentInfo.scholarshipName,
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
        success_url: `${process.env.SITE_DOMAIN}/payment-success?session_id={CHECKOUT_SESSION_ID}&id=${paymentInfo._id}`,
        cancel_url: `${process.env.SITE_DOMAIN}/payment-error?apl_id=${paymentInfo._id}`,
      });
      res.send({ url: session.url });
    });

    app.patch("/payment-success", verifyJwt, async (req, res) => {
      try {
        const session_id = req.query.session_id;
        if (!session_id) {
          return res.status(400).send({ message: "Missing session_id" });
        }
        const session = await stripe.checkout.sessions.retrieve(session_id);
        if (!session) {
          return res.status(404).send({ message: "Stripe session not found" });
        }
        const metadata = session.metadata;
        const applicationFees = parseFloat(metadata.applicationFees);
        const serviceCharge = parseFloat(metadata.serviceCharge);
        const scholarshipId = metadata.scholarshipId;
        const applicationData = {
          scholarshipId,
          userId: metadata.userId,
          userName: metadata.userName,
          userEmail: metadata.userEmail,
          scholarshipName: metadata.scholarshipName,
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
        const existingPayment = await applicationCollection.findOne({
          tnxId: session.payment_intent,
        });

        if (existingPayment) {
          return res.status(200).send({ message: "Payment already processed" });
        }
        const existingApplication = await applicationCollection.findOne({
          userEmail: metadata.userEmail,
          _id: new ObjectId(metadata.scholarshipId),
        });
        if (existingApplication) {
          const result = await applicationCollection.updateOne({ _id: existingApplication._id }, { $set: { paymentStatus: "paid", tnxId: session.payment_intent } });
          return res.status(200).send({
            message: "Application updated to paid",
            updatedId: existingApplication._id,
            result,
          });
        }
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
        return res.send("already exists");
      } else {
        const result = await applicationCollection.insertOne(info);
      }
    });
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
