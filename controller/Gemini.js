const GeminiService = require("../service/GeminiService");

const askAi = async (req, res) => {
  const  prs = "The User Experience (UX) and UI flow must prioritize a minimalist, conversion-focused design that guides users through authentication with zero ambiguity. The interface should utilize a progressive disclosure approach—where complex fields are hidden until needed—and provide instant, inline feedback for form validation to prevent error fatigue. For mobile users, the flow must be optimized for thumb-reachability, featuring high-contrast primary action buttons and clearly separated alternative login methods (e.g., social login buttons with recognizable brand logos). Key UI/UX Patterns: Inline Validation: Real-time feedback for password strength and email format directly beneath the input field,Contextual Assistance: Helpful tooltips for password requirements that disappear as conditions are met. Seamless Transitions: Smooth animations between Sign In and Sign Up states to keep the user oriented. Error Recovery: A direct path to the Forgot Password flow from any failed login attempt."

  try {
    const {
      feature = "login/register flow",
      platform = "mobile",
      additionalContext,
    } = req.body || {};

    const text = await GeminiService.generateTestCases({
      feature,
      platform,
      prdText: prs,
      additionalContext,
    });

    res.json({ success: true, data: text });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};


module.exports = {
  askAi
};