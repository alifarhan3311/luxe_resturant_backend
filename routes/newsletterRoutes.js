const express = require("express");
const router = express.Router();
const {
  subscribe,
  unsubscribe,
  getSubscribers,
  sendNewsletter,
} = require("../controllers/newsletterController");
const { protect, authorize } = require("../middleware/auth");

router.post("/subscribe", subscribe);
router.post("/unsubscribe", unsubscribe);
router.get("/", protect, authorize("admin"), getSubscribers);
router.post("/send", protect, authorize("admin"), sendNewsletter);

module.exports = router;
