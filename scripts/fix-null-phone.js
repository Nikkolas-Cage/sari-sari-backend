require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../models/User");

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);

  const users = await User.find({});
  for (const user of users) {
    let dirty = false;
    if (user.phone === null) {
      user.phone = undefined;
      user.set("phone", undefined);
      dirty = true;
    }
    if (user.email === null) {
      user.email = undefined;
      user.set("email", undefined);
      dirty = true;
    }
    if (dirty) {
      await user.save();
      // unset null fields explicitly
      await User.updateOne(
        { _id: user._id },
        { $unset: { phone: "", ...(user.email == null ? { email: "" } : {}) } }
      );
    }
  }

  // Force-unset phone:null on all docs
  await User.collection.updateMany({ phone: null }, { $unset: { phone: "" } });
  await User.collection.updateMany({ email: null }, { $unset: { email: "" } });

  console.log("cleaned null phone/email fields");

  try {
    const existing = await User.findOne({
      $or: [{ firebaseUid: "Zd1C7H8daNXNLIRZgeJRg3Mqiin2" }, { email: "rushingaura@gmail.com" }],
    });
    if (existing) {
      console.log("buyer already exists", existing._id.toString(), existing.role);
    } else {
      const u = await User.create({
        firebaseUid: "Zd1C7H8daNXNLIRZgeJRg3Mqiin2",
        name: "Rush",
        email: "rushingaura@gmail.com",
        role: "buyer",
        lastLoginAt: new Date(),
      });
      console.log("created buyer", u._id.toString());
    }
  } catch (e) {
    console.error("create error", e.code, e.message);
  }

  console.log(JSON.stringify(await User.find({}).select("email role phone firebaseUid").lean(), null, 2));
  process.exit(0);
})();
