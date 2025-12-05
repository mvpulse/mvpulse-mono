import type { Step } from "react-joyride";

// Creator Tour Steps
export const creatorTourSteps: Step[] = [
  {
    target: '[data-tour="creator-welcome"]',
    content: "Welcome to the Creator Dashboard! Let's take a quick tour of the key features.",
    placement: "center",
    disableBeacon: true,
  },
  {
    target: '[data-tour="creator-stats"]',
    content: "Here you can see your poll statistics at a glance - total polls created, responses received, active polls, and total rewards funded.",
    placement: "bottom",
  },
  {
    target: '[data-tour="creator-create-poll"]',
    content: "Click here to create a new poll. You can set up questions, options, rewards, and duration.",
    placement: "left",
  },
  {
    target: '[data-tour="sidebar-manage-polls"]',
    content: "Manage all your polls here. View status, close polls, and control reward distributions.",
    placement: "right",
  },
  {
    target: '[data-tour="sidebar-distributions"]',
    content: "Track and manage reward distributions to your poll participants.",
    placement: "right",
  },
  {
    target: '[data-tour="recent-polls"]',
    content: "Your recently created polls appear here. Click on any poll to see detailed analytics and responses.",
    placement: "top",
  },
  {
    target: '[data-tour="sidebar-help"]',
    content: "Need help? Click here anytime to restart this tour or access help resources.",
    placement: "right",
  },
];

// Participant Tour Steps
export const participantTourSteps: Step[] = [
  {
    target: '[data-tour="participant-welcome"]',
    content: "Welcome to the Participant Dashboard! Let's explore how to vote and earn rewards.",
    placement: "center",
    disableBeacon: true,
  },
  {
    target: '[data-tour="participant-stats"]',
    content: "Track your participation stats - polls voted, pending rewards, total earnings, and available polls.",
    placement: "bottom",
  },
  {
    target: '[data-tour="claimable-rewards"]',
    content: "When polls end, you can claim your rewards here. The green cards show polls with pending rewards.",
    placement: "top",
  },
  {
    target: '[data-tour="sidebar-explore-polls"]',
    content: "Browse all available polls here. Vote on polls to earn rewards!",
    placement: "right",
  },
  {
    target: '[data-tour="sidebar-voting-history"]',
    content: "View your complete voting history and track which polls you've participated in.",
    placement: "right",
  },
  {
    target: '[data-tour="sidebar-rewards"]',
    content: "Access all your reward information here - pending claims and claim history.",
    placement: "right",
  },
  {
    target: '[data-tour="recommended-polls"]',
    content: "Discover recommended polls with rewards. Vote to participate and earn!",
    placement: "top",
  },
  {
    target: '[data-tour="sidebar-help"]',
    content: "Need help? Click here anytime to restart this tour.",
    placement: "right",
  },
];

// Helper to get steps by role
export function getTourSteps(role: "creator" | "participant"): Step[] {
  return role === "creator" ? creatorTourSteps : participantTourSteps;
}
