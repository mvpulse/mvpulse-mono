import { Switch, Route } from "wouter";
import { Layout } from "@/components/Layout";
import { AIChatAssistant } from "@/components/AIChatAssistant";
import { SidebarProvider } from "@/contexts/SidebarContext";
import Home from "@/pages/Home";
import Dashboard from "@/pages/Dashboard";
import Projects from "@/pages/Projects";
import CreatePoll from "@/pages/CreatePoll";
import PollDetails from "@/pages/PollDetails";
import Admin from "@/pages/Admin";
import Wallet from "@/pages/Wallet";
import NotFound from "@/pages/not-found";

// Creator pages
import CreatorDashboard from "@/pages/creator/CreatorDashboard";
import ManagePolls from "@/pages/creator/ManagePolls";
import ManagePoll from "@/pages/creator/ManagePoll";
import Distributions from "@/pages/creator/Distributions";

// Participant pages
import ParticipantDashboard from "@/pages/participant/ParticipantDashboard";
import VotingHistory from "@/pages/participant/VotingHistory";
import Rewards from "@/pages/participant/Rewards";

function App() {
  return (
    <SidebarProvider>
      <Layout>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/projects" component={Projects} />
        <Route path="/create" component={CreatePoll} />
        <Route path="/poll/:id" component={PollDetails} />
        <Route path="/wallet" component={Wallet} />
        <Route path="/admin" component={Admin} />

        {/* Creator routes */}
        <Route path="/creator" component={CreatorDashboard} />
        <Route path="/creator/manage/:pollId" component={ManagePoll} />
        <Route path="/creator/manage" component={ManagePolls} />
        <Route path="/creator/distributions" component={Distributions} />

        {/* Participant routes */}
        <Route path="/participant" component={ParticipantDashboard} />
        <Route path="/participant/history" component={VotingHistory} />
        <Route path="/participant/rewards" component={Rewards} />

        <Route component={NotFound} />
      </Switch>
      <AIChatAssistant />
      </Layout>
    </SidebarProvider>
  );
}

export default App;
