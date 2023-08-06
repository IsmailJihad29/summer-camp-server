const express = require("express");
const jwt = require("jsonwebtoken");

const app = express();
require("dotenv").config();
const cors = require("cors");
const stripe = require('stripe')(process.env.PAYMENT_SECRET_KEY)

const port = process.env.PORT || 5000;

app.use(cors());

app.use(express.json());

const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res
      .status(401)
      .send({ error: true, message: " Unauthorized Access" });
  }

  const token = authorization.split(" ")[1];

  jwt.verify(token, process.env.ACCESS_TOKEN, (err, decoded) => {
    if (err) {
      return res
        .status(401)
        .send({ error: true, message: "Invalid authorization" });
    }
    req.decoded = decoded;
    next();
  });
};

//---------------------------- mongodb ------------------------------

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.kz2rvmj.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)

    await client.connect();

    const classCollection = client.db("rhythmDb").collection("classes");
    const enrollClassCollection = client.db("rhythmDb").collection("carts");
    const paymentCollection = client.db("rhythmDb").collection("payments");
    const userCollection = client.db("rhythmDb").collection("users");
    const reviewsCollection = client.db("rhythmDb").collection("reviews");

   
   

// verify admin   and make instructor or admin  && other api 
    const verifyAdmin = async(req, res, next) => {
      const email = req.decoded.email
      const query = { email: email }
      const user = await userCollection.findOne(query)
      if (user?.role !== 'admin') {
        return res.status(403).send({ error: true , message: 'forbidden message'})
      }
      next()
    }

   
    app.get("/users", verifyJWT,verifyAdmin, async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    app.get("/instructor", async (req, res) => {
      const query = { role: "instructor"  }
      const result = await userCollection.find(query).toArray()
        res.send(result);
    })


    app.get("/users/admin/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;

      if (req.decoded.email !== email) {
        res.send({ admin: false });
      }

      const query = { email: email };
      const user = await userCollection.findOne(query);

      const result = { admin: user?.role === "admin" };
      res.send(result);
    });


    app.get("/users/instructor/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;

      if (req.decoded.email !== email) {
        res.send({ instructor: false });
      }

      const query = { email: email };
      const user = await userCollection.findOne(query);

      const result = { instructor: user?.role === "instructor" };
      res.send(result);
    });

    app.post("/jwt", (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN, {
        expiresIn: "1h",
      });
      res.send({ token });
    });

    app.post("/users", async (req, res) => {
      const user = req.body;

      const query = { email: user.email };
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "User already exists" });
      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    app.post("/checkuser-role", async (req, res) => {
      const email = req.body?.email;
      if (email) {
        const query = { email: email };
        const result = await userCollection.findOne(query);
        if (result) {
          res.send({ role: result?.role });
        }
      } else {
        res.send({ role: null });
      }
    });
    

    app.patch("/users/admin/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: "admin",
        },
      };
      const result = await userCollection.updateOne(filter, updateDoc);
      res.send(result);
    });
    
    app.patch("/users/instructor/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: "instructor",
        },
      };
      const result = await userCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    app.delete("/users/admin/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await userCollection.deleteOne(query);
      res.send(result);
    });



    // reviews

    app.get("/reviews", async (req, res) => { 
      const result = await reviewsCollection.find().toArray()
      res.send(result);
    })

/**--------------------------------------------------------------------
 *  class api 
 */

    app.get("/class",  async (req, res) => {
      const result = await classCollection.find().toArray();
      res.send(result);
    });

    app.get("/class/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await classCollection.findOne(query);
      res.send(result);
    });

    app.post("/class", async(req, res) => { 
      const classes = req.body
      console.log('new toy', classes);
      const result = await classCollection.insertOne(classes);
      res.send(result)
    })

    app.post("/class/:id", async (req, res) => { 
      const id = req.params.id;
      const updateStatus = req.body.status
      const filter = { _id: new ObjectId(id) }
      const updetedStatus = {
        $set: {
          status: updateStatus
        }
      }
      const result = await classCollection.updateOne(filter, updetedStatus);
      res.send(result)
    }) 


    app.put("/update-seat-enrollment/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const { available_seat, enrolled_student } = req.body;
      console.log({ id, enrolled_student, available_seat });
      const filter = {
        _id: new ObjectId(id),
      };
      const updateClassInfo = {
        $set: {
          available_seat: available_seat - 1,
          enrolled_student: enrolled_student + 1,
        },
      };
      const options = { upsert: false };
      const updatedResult = await classCollection.updateOne(
        filter,
        updateClassInfo,
        options
      );

      res.send({ updatedResult });
    });


    app.put("/feedback/:id", async (req, res) => { 
      const id = req.params.id;
      const updateFeedback = req.body.feedback
      const filter = { _id: new ObjectId(id) }
      const feedback = {
        $set: {
          feedback: updateFeedback
        }
      }
      const result = await classCollection.updateOne(filter, feedback);
      res.send(result)
    }) 

    app.patch("/class/:id", async (req, res) => { 
      const id = req.params.id;
      const updatedClass = req.body
      const filter = { _id: new ObjectId(id) }
      const newClass = {
        $set: {
          class_name: updatedClass. class_name,
          class_image: updatedClass.class_image,
          price: updatedClass.price,
          available_seat: updatedClass.available_seat,
        }
      }
      const result = await classCollection.updateOne(filter, newClass, )
      res.send(result)
    })

    app.delete("/class/:id", async (req, res) => { 
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await classCollection.deleteOne(query)
      res.send(result)
    })

    // ----------------------------------------------------------------------------



  /**-----------------------------------------------------------------------------
   *  Carts api 
   */

    app.get("/carts", verifyJWT, async (req, res) => {
      const email = req.query.email;
      if (!email) {
        res.send([]);
      }
      const decodedEmail = req.decoded.email;
      if (email !== decodedEmail) {
        return res
          .status(401)
          .send({ error: true, message: "Forbidden access" });
      }

      const query = { email: email };
      const result = await enrollClassCollection.find(query).toArray();
      res.send(result);
    });

    app.get("/carts/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await enrollClassCollection.findOne(query);
      res.send(result);
    });

    app.post("/carts", async (req, res) => {
      const item = req.body;
      const findAddedClass = await enrollClassCollection.findOne({
        class_id: item?.class_id,
        email: item?.email
      })
      if (!findAddedClass) {
        const result = await enrollClassCollection.insertOne(item)
        res.send(result)
      }
      else {
        res.send("already added")
      }
    });

    app.delete("/carts/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await enrollClassCollection.deleteOne(query);
      res.send(result);
    });

    // --------------------------------------------------------------------



    /**-----------------------------------------------------------------
     * payments and enrolled api 
     */
    app.get("/enrolled", verifyJWT, async (req, res) => {
      const email = req.query.email;
      if (!email) {
        res.send([]);
      }
      const decodedEmail = req.decoded.email;
      if (email !== decodedEmail) {
        return res
          .status(403)
          .send({ error: true, message: "Forbidden access" });
      }
      const query = { email: email };
      const result = await paymentCollection.find(query).toArray();
      res.send(result);
    });


    app.post("/create-payment-intent", verifyJWT, async (req, res) => { 
      const {price} = req.body
      const amount = price * 100 
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      })
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    })

    app.post("/payments", verifyJWT, async (req, res) => { 
      const payment = req.body 
      const result = await paymentCollection.insertOne(payment)
      res.send(result);
    })


    // ------------------------------------------------------------------

   
  
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("summer camp running buddy get your classes now");
});

app.listen(port, () => {
  console.log(`summer camp is runnig  running on port ${port}`);
});
