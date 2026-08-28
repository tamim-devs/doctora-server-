const dotenv = require("dotenv");
dotenv.config();

const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const { createRemoteJWKSet, jwtVerify } = require("jose-cjs");

const app = express();
const port = process.env.PORT;

app.use(
  cors({
    credentials: true,
    origin: [process.env.CLIENT_URL],
  }),
);

app.use(express.json());

const uri = process.env.MONGODB_URI;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});



const JWKS = createRemoteJWKSet(
  new URL(`${process.env.CLIENT_URL}/api/auth/jwks`),
);




const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      msg: "Unauthorized",
    });
  }

  const token = authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({
      msg: "Unauthorized",
    });
  }

  try {
    const { payload } = await jwtVerify(token, JWKS);

    req.user = payload;

    next();
  } catch (error) {
    console.error("Token verification error:", error);

    return res.status(401).json({
      msg: "Unauthorized",
    });
  }
};



const doctorVerify = async (req, res, next) => {
  try {
    const user = req.user;

    console.log("DOCTOR VERIFY USER:", user);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User not found",
      });
    }

    if (user.role !== "doctor") {
      return res.status(403).json({
        success: false,
        message: "Only doctors can access this route",
      });
    }

    next();
  } catch (error) {
    console.error("Doctor verify error:", error);

    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};


const adminVerify = async (req, res, next) => {
  try {
    const user = req.user;

    if (user.role !== "admin") {
      return res.status(403).json({
        msg: "Only admin can access this route",
      });
    }

    next();
  } catch (error) {
    console.error("Admin verify error:", error);

    return res.status(500).json({
      msg: "Server error",
    });
  }
};

// ======================================================


async function run() {
  try {
    // await client.connect();

    const db = client.db("medi-conector");



    const usersCollection = db.collection("user");
    const appointmentsCollection = db.collection("appointments");
    const reviewsCollection = db.collection("reviews");



    

app.post("/reviews", verifyToken, async (req, res) => {
  try {
    const {
      appointmentId,
      doctorId,
      doctorName,
      rating,
      comment,
    } = req.body;

    if (req.user.role !== "patient") {
      return res.status(403).json({
        success: false,
        message: "Only patients can submit reviews",
      });
    }

    if (!appointmentId || !doctorId || !rating) {
      return res.status(400).json({
        success: false,
        message: "Appointment ID, Doctor ID and rating are required",
      });
    }

    if (Number(rating) < 1 || Number(rating) > 5) {
      return res.status(400).json({
        success: false,
        message: "Rating must be between 1 and 5",
      });
    }

    const appointment = await appointmentsCollection.findOne({
      _id: new ObjectId(appointmentId),
      patientId: req.user.id,
      doctorId: doctorId,
    });

    if (!appointment) {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to review this appointment",
      });
    }

    if (appointment.status?.toLowerCase() !== "completed") {
      return res.status(400).json({
        success: false,
        message: "You can only review completed appointments",
      });
    }

    const existingReview = await reviewsCollection.findOne({
      appointmentId,
      patientId: req.user.id,
    });

    if (existingReview) {
      return res.status(400).json({
        success: false,
        message: "You have already reviewed this appointment",
      });
    }

    const reviewData = {
      appointmentId,
      doctorId,

  
      doctorName: doctorName || appointment.doctorName || "Unknown Doctor",

  
      specialization:
        appointment.specialization || "",

      patientId: req.user.id,
      patientName: req.user.name || "Anonymous",

      rating: Number(rating),
      comment: comment?.trim() || "",

      createdAt: new Date(),
    };

    console.log("REVIEW DATA:", reviewData);

    const result = await reviewsCollection.insertOne(reviewData);

    res.status(201).json({
      success: true,
      message: "Review submitted successfully",
      data: reviewData,
      result,
    });
  } catch (error) {
    console.error("Create review error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to submit review",
    });
  }
});
  
app.get("/reviews", async (req, res) => {
  try {
    const reviews = await reviewsCollection
      .find({})
      .sort({ createdAt: -1 })
      .toArray();

    res.status(200).json({
      success: true,
      data: reviews,
    });
  } catch (error) {
    console.error("Get all reviews error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to get reviews",
    });
  }
});

app.get("/reviews/doctor/:doctorId", async (req, res) => {
  try {
    const { doctorId } = req.params;

    const reviews = await reviewsCollection
      .find({ doctorId })
      .sort({ createdAt: -1 })
      .toArray();

    res.status(200).json({
      success: true,
      data: reviews,
    });
  } catch (error) {
    console.error("Get doctor reviews error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to get doctor reviews",
    });
  }
});

app.get("/reviews/my", verifyToken, async (req, res) => {
  try {
    const reviews = await reviewsCollection
      .find({
        patientId: req.user.id,
      })
      .sort({
        createdAt: -1,
      })
      .toArray();

    console.log("MY REVIEWS:", reviews);

    res.status(200).json({
      success: true,
      data: reviews,
    });
  } catch (error) {
    console.error("Get my reviews error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch my reviews",
    });
  }
});

app.get(
  "/doctor/appointments",
  verifyToken,
  doctorVerify,
  async (req, res) => {
    try {
      const appointments = await appointmentsCollection
        .find({
          doctorId: req.user.id,
        })
        .sort({
          createdAt: -1,
        })
        .toArray();

      res.status(200).json({
        success: true,
        data: appointments,
      });
    } catch (error) {
      console.error("Get doctor appointments error:", error);

      res.status(500).json({
        success: false,
        message: "Failed to fetch doctor appointments",
      });
    }
  }
);

app.post("/appointments", verifyToken, async (req, res) => {
  try {
    const appointmentData = req.body;

    const existingAppointment =
      await appointmentsCollection.findOne({
        stripeSessionId: appointmentData.stripeSessionId,
      });

    if (existingAppointment) {
      return res.status(200).json({
        success: true,
        message: "Appointment already exists",
      });
    }

    const appointment = {
      ...appointmentData,
      patientName: req.user.name,
      patientId: req.user.id,
      patientEmail: req.user.email,
      status: "pending",
      paymentStatus: "paid",
      createdAt: new Date(),
    };

    const result =
      await appointmentsCollection.insertOne(appointment);

    res.status(201).json({
      success: true,
      message: "Appointment created successfully",
      result,
    });
  } catch (error) {
    console.error("Create appointment error:", error);

    res.status(500).json({
      success: false,
      msg: "Failed to create appointment",
    });
  }
});

app.get("/appointments", verifyToken, async (req, res) => {
  try {
    const appointments = await appointmentsCollection
      .find({
        patientId: req.user.id,
      })
      .sort({
        createdAt: -1,
      })
      .toArray();

    res.status(200).json({
      success: true,
      data: appointments,
    });
  } catch (error) {
    console.error("Get appointments error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to get appointments",
    });
  }
});


app.get('/', async(req,res)=>{
  res.send('Project is running')
})

app.get(
  "/doctor/patients",
  verifyToken,
  doctorVerify,
  async (req, res) => {
    try {
      const doctorId = req.user.id;

      console.log("DOCTOR ID:", doctorId);

      const appointments = await appointmentsCollection
        .find({
          doctorId: doctorId,
        })
        .sort({ createdAt: -1 })
        .toArray();

      const patientIds = [
        ...new Set(
          appointments
            .map((appointment) => appointment.patientId)
            .filter(Boolean)
        ),
      ];

      if (patientIds.length === 0) {
        return res.status(200).json({
          success: true,
          data: [],
        });
      }

      const patients = await usersCollection
        .find({
          role: "patient",
          id: { $in: patientIds },
        })
        .toArray();

      return res.status(200).json({
        success: true,
        data: patients,
      });
    } catch (error) {
      console.error("Get doctor patients error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to get patients",
      });
    }
  }
);



  app.get("/doctors", async (req, res) => {
  try {
    const { search, specialization } = req.query;

    const query = {
      role: "doctor",
    };

   
    if (search?.trim()) {
      query.name = {
        $regex: search.trim(),
        $options: "i",
      };
    }

   
    if (specialization?.trim()) {
      query.specialization = specialization.trim();
    }

    const doctors = await usersCollection
      .find(query)
      .toArray();

    res.status(200).json({
      success: true,
      data: doctors,
    });
  } catch (error) {
    console.error("Get doctors error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to get doctors",
    });
  }
});

    app.get("/doctors/featured", async (req, res) => {
  try {
    const doctors = await usersCollection
      .find({
        role: "doctor",
      })
      .limit(3)
      .toArray();

    res.json(doctors);
  } catch (error) {
    console.error("Get featured doctors error:", error);

    res.status(500).json({
      msg: "Failed to get featured doctors",
    });
  }
});
  
app.get("/doctors/:id",  async (req, res) => {
  try {
    const { id } = req.params;

    const doctor = await usersCollection.findOne({
      _id: new ObjectId(id),
      role: "doctor",
    });

    if (!doctor) {
      return res.status(404).json({
        msg: "Doctor not found",
      });
    }

    res.json(doctor);
  } catch (error) {
    console.error("Get single doctor error:", error);

    res.status(500).json({
      msg: "Failed to get doctor",
    });
  }
});





app.get(
  "/admin/stats",
  verifyToken,
  adminVerify,
  async (req, res) => {
    try {
      const totalDoctors = await usersCollection.countDocuments({
        role: "doctor",
      });

      const totalPatients = await usersCollection.countDocuments({
        role: "patient",
      });

      const totalAppointments =
        await appointmentsCollection.countDocuments();

      const pendingDoctors = await usersCollection
        .find({
          role: "doctor",
          status: "pending",
        })
        .sort({ createdAt: -1 })
        .limit(3)
        .toArray();

      // ==========================================
      // TOTAL INCOME
      // ==========================================

      const incomeResult = await appointmentsCollection
        .aggregate([
          {
            $match: {
              paymentStatus: "paid",
            },
          },
          {
            $group: {
              _id: null,
              totalIncome: {
                $sum: {
                  $toDouble: "$consultationFee",
                },
              },
            },
          },
        ])
        .toArray();

      const totalIncome = incomeResult[0]?.totalIncome || 0;

      console.log("TOTAL INCOME:", totalIncome);

      res.status(200).json({
        success: true,
        data: {
          totalDoctors,
          totalPatients,
          totalAppointments,
          totalIncome,
          pendingDoctors,
        },
      });
    } catch (error) {
      console.error("Admin stats error:", error);

      res.status(500).json({
        success: false,
        message: "Failed to get admin dashboard stats",
      });
    }
  }
);

    app.patch("/doctors/profile", verifyToken, async (req, res) => {
  try {
    console.log("USER:", req.user);
    console.log("BODY:", req.body);

    const result = await usersCollection.updateOne(
      { email: req.user.email },
      {
        $set: {
          ...req.body,
          profileCompleted: true,
          status: "pending",
          updatedAt: new Date(),
        },
      }
    );

    res.send({
      success: true,
      message: "Profile submitted successfully",
      result,
    });
  } catch (error) {
    console.log("DOCTOR PROFILE ERROR:", error);

    res.status(500).send({
      success: false,
      message: error.message,
    });
  }
    });


   app.patch(
  "/doctor/appointments/:id/status",
  verifyToken,
  doctorVerify,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      const allowedStatuses = [
        "pending",
        "completed",
        "cancelled",
      ];

      if (!allowedStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Invalid appointment status",
        });
      }

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid appointment ID",
        });
      }

      const appointment = await appointmentsCollection.findOne({
        _id: new ObjectId(id),
        doctorId: req.user.id,
      });

      if (!appointment) {
        return res.status(404).json({
          success: false,
          message: "Appointment not found",
        });
      }

      const result = await appointmentsCollection.updateOne(
        {
          _id: new ObjectId(id),
          doctorId: req.user.id,
        },
        {
          $set: {
            status,
            updatedAt: new Date(),
          },
        }
      );

      if (result.modifiedCount === 0) {
        return res.status(400).json({
          success: false,
          message: "Appointment status was not updated",
        });
      }

      res.status(200).json({
        success: true,
        message: `Appointment ${status} successfully`,
      });
    } catch (error) {
      console.error("Update appointment status error:", error);

      res.status(500).json({
        success: false,
        message: "Failed to update appointment status",
      });
    }
  }
);
  


 

 

app.patch("/patients/profile", async (req, res) => {
  try {
    const { email, ...patientData } = req.body;

    const result = await usersCollection.updateOne(
      { email },
      {
        $set: {
          ...patientData,
          profileCompleted: true,
          status: "verified",
          updatedAt: new Date(),
        },
      }
    );

    res.json({
      success: true,
      message: "Patient profile updated successfully",
      result,
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Failed to update patient profile",
    });
  }
});










  

app.patch(
  "/admin/doctors/:id/approve",
  verifyToken,
  adminVerify,
  async (req, res) => {
    try {
      const { id } = req.params;

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid doctor ID",
        });
      }

      const doctor = await usersCollection.findOne({
        _id: new ObjectId(id),
        role: "doctor",
      });

      if (!doctor) {
        return res.status(404).json({
          success: false,
          message: "Doctor not found",
        });
      }

      const result = await usersCollection.updateOne(
        {
          _id: new ObjectId(id),
          role: "doctor",
        },
        {
          $set: {
            approvalStatus: "approved",
            status: "approved",
            updatedAt: new Date(),
          },
        }
      );

      res.status(200).json({
        success: true,
        message: "Doctor verified successfully",
        result,
      });
    } catch (error) {
      console.error("Verify doctor error:", error);

      res.status(500).json({
        success: false,
        message: "Failed to verify doctor",
      });
    }
  }
);




app.delete(
  "/admin/doctors/:id",
  verifyToken,
  adminVerify,
  async (req, res) => {
    try {
      const { id } = req.params;

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid doctor ID",
        });
      }

      const doctor = await usersCollection.findOne({
        _id: new ObjectId(id),
        role: "doctor",
      });

      if (!doctor) {
        return res.status(404).json({
          success: false,
          message: "Doctor not found",
        });
      }

      const result = await usersCollection.deleteOne({
        _id: new ObjectId(id),
        role: "doctor",
      });

      if (result.deletedCount === 0) {
        return res.status(400).json({
          success: false,
          message: "Doctor was not deleted",
        });
      }

      res.status(200).json({
        success: true,
        message: "Doctor deleted successfully",
      });
    } catch (error) {
      console.error("Delete doctor error:", error);

      res.status(500).json({
        success: false,
        message: "Failed to delete doctor",
      });
    }
  }
);

app.get("/", (req, res) => {
  res.send("Server is running fine!");
});




    await client.db("admin").command({
      ping: 1,
    });

    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
  } catch (error) {
    console.error("MongoDB connection error:", error);
  }
}

run().catch(console.dir);

// ======================================================
// ROOT
// ======================================================





// app.listen(port, () => {
//   console.log(`Server running on port ${port}`);
// });


module.exports = app;