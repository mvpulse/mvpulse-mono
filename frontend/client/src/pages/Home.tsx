import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowRight, BarChart3, ShieldCheck, Zap, Users, Coins, FileCheck, Activity, CheckCircle2, Heart } from "lucide-react";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import generatedImage from '@assets/generated_images/futuristic_fluid_3d_shapes_with_neon_yellow_and_deep_purple_gradients_on_dark_background.png';

export default function Home() {
  const [_, setLocation] = useLocation();

  const stats = [
    {
      label: "Polls Created",
      value: "10,000+",
      icon: FileCheck,
      color: "text-primary"
    },
    {
      label: "Total Responses",
      value: "1.2M+",
      icon: Users,
      color: "text-accent"
    },
    {
      label: "Rewards Distributed",
      value: "$500k+",
      icon: Coins,
      color: "text-green-400"
    },
    {
      label: "Active Users",
      value: "50k+",
      icon: Activity,
      color: "text-blue-400"
    }
  ];

  return (
    <div className="min-h-screen bg-background text-foreground overflow-hidden selection:bg-primary selection:text-primary-foreground">
      {/* Hero Section */}
      <section className="relative min-h-screen flex flex-col justify-center items-center text-center px-4 py-20">
        {/* Background Image with Overlay */}
        <div className="absolute inset-0 z-0">
          <img 
            src={generatedImage} 
            alt="Abstract background" 
            className="w-full h-full object-cover opacity-40 dark:opacity-30"
          />
          <div className="absolute inset-0 bg-linear-to-b from-background/20 via-background/80 to-background z-10" />
        </div>

        <div className="relative z-20 max-w-4xl mx-auto space-y-8 animate-in fade-in zoom-in duration-1000">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 backdrop-blur-md text-primary text-sm font-medium mb-4">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
            </span>
            Live on Movement Testnet
          </div>
          
          <h1 className="text-5xl md:text-7xl lg:text-8xl font-display font-bold tracking-tighter leading-tight">
            Decentralized <br />
            <span className="bg-clip-text text-transparent bg-linear-to-r from-primary via-yellow-200 to-accent animate-pulse">
              Insights
            </span>
          </h1>
          
          <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            The first incentivized polling platform on Movement. Create surveys, earn rewards, and govern communities with on-chain transparency.
          </p>

          <div className="flex flex-col sm:flex-row flex-wrap gap-4 justify-center pt-8">
            <Card className="p-6 w-full sm:w-72 bg-card/30 backdrop-blur-xl border-primary/20 hover:border-primary hover:bg-card/50 transition-all group cursor-pointer" onClick={() => setLocation('/creator')}>
              <div className="h-12 w-12 rounded-lg bg-primary/20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <BarChart3 className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-xl font-bold font-display mb-2">For Creators</h3>
              <p className="text-sm text-muted-foreground mb-4">Launch polls, analyze data, and manage communities.</p>
              <div className="flex items-center text-sm font-bold text-primary">
                Start Creating <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
              </div>
            </Card>

            <Card className="p-6 w-full sm:w-72 bg-card/30 backdrop-blur-xl border-accent/20 hover:border-accent hover:bg-card/50 transition-all group cursor-pointer" onClick={() => setLocation('/participant')}>
              <div className="h-12 w-12 rounded-lg bg-accent/20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Users className="w-6 h-6 text-accent" />
              </div>
              <h3 className="text-xl font-bold font-display mb-2">For Participants</h3>
              <p className="text-sm text-muted-foreground mb-4">Vote on proposals, share opinions, and earn rewards.</p>
              <div className="flex items-center text-sm font-bold text-accent">
                Start Earning <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
              </div>
            </Card>

            <Card className="p-6 w-full sm:w-72 bg-card/30 backdrop-blur-xl border-pink-500/20 hover:border-pink-500 hover:bg-card/50 transition-all group cursor-pointer" onClick={() => setLocation('/donor')}>
              <div className="h-12 w-12 rounded-lg bg-pink-500/20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Heart className="w-6 h-6 text-pink-500" />
              </div>
              <h3 className="text-xl font-bold font-display mb-2">For Donors</h3>
              <p className="text-sm text-muted-foreground mb-4">Fund polls, support communities, and boost rewards.</p>
              <div className="flex items-center text-sm font-bold text-pink-500">
                Start Funding <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
              </div>
            </Card>
          </div>
        </div>
      </section>

      {/* Stats Section with Scroll Reveal */}
      <section className="py-20 bg-muted/10 border-y border-border/50 backdrop-blur-sm relative z-20">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((stat, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="flex flex-col items-center text-center space-y-2"
              >
                <div className={`p-3 rounded-full bg-background/50 backdrop-blur-md border border-border/50 mb-2 ${stat.color} bg-opacity-10`}>
                  <stat.icon className={`w-6 h-6 ${stat.color}`} />
                </div>
                <h3 className="text-4xl md:text-5xl font-display font-bold tracking-tighter">{stat.value}</h3>
                <p className="text-sm text-muted-foreground font-medium uppercase tracking-wider">{stat.label}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-24 container mx-auto px-4 relative z-20">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl md:text-5xl font-display font-bold mb-4">How It Works</h2>
          <p className="text-muted-foreground text-lg">Start gathering decentralized insights in three simple steps.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
          {/* Connecting Line */}
          <div className="hidden md:block absolute top-12 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-primary/30 to-transparent -z-10" />

          {[
            { step: 1, title: "Create Poll", desc: "Design your survey and set reward parameters in MOVE or USDC.", icon: FileCheck },
            { step: 2, title: "Community Votes", desc: "Verified users participate and cast their on-chain votes.", icon: Users },
            { step: 3, title: "Earn Rewards", desc: "Smart contracts automatically distribute funds to participants.", icon: Coins }
          ].map((item, i) => (
            <div key={i} className="flex flex-col items-center text-center bg-background/50 backdrop-blur-sm p-6 rounded-2xl border border-border/50 hover:border-primary/50 transition-colors">
              <div className="w-24 h-24 rounded-full bg-card border-4 border-background shadow-xl flex items-center justify-center mb-6 relative z-10">
                <item.icon className="w-10 h-10 text-primary" />
                <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm">
                  {item.step}
                </div>
              </div>
              <h3 className="text-xl font-bold font-display mb-2">{item.title}</h3>
              <p className="text-muted-foreground">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-24 px-4 bg-muted/5 container mx-auto relative z-20 rounded-3xl my-12 border border-border/50">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl md:text-5xl font-display font-bold mb-4">Why MovePoll?</h2>
          <p className="text-muted-foreground text-lg">Built for the next generation of decentralized communities.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="space-y-4 p-6 rounded-2xl bg-card/50 hover:bg-card transition-colors border border-border/50">
            <Zap className="w-8 h-8 text-primary" />
            <h3 className="text-xl font-bold">Instant Finality</h3>
            <p className="text-muted-foreground">Powered by Movement's high-throughput network for real-time voting results.</p>
          </div>
          <div className="space-y-4 p-6 rounded-2xl bg-card/50 hover:bg-card transition-colors border border-border/50">
            <ShieldCheck className="w-8 h-8 text-accent" />
            <h3 className="text-xl font-bold">Sybil Resistant</h3>
            <p className="text-muted-foreground">Advanced verification ensures one person, one vote integrity for all polls.</p>
          </div>
          <div className="space-y-4 p-6 rounded-2xl bg-card/50 hover:bg-card transition-colors border border-border/50">
            <BarChart3 className="w-8 h-8 text-blue-400" />
            <h3 className="text-xl font-bold">AI Analytics</h3>
            <p className="text-muted-foreground">Built-in AI tools to generate insights and summaries from your survey data.</p>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-24 container max-w-3xl mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-5xl font-display font-bold mb-4">Frequently Asked Questions</h2>
          <p className="text-muted-foreground">Everything you need to know about MovePoll.</p>
        </div>

        <Accordion type="single" collapsible className="w-full space-y-4">
          <AccordionItem value="item-1" className="border border-border/50 rounded-lg px-4 bg-card/30">
            <AccordionTrigger className="hover:no-underline font-medium text-lg">How do rewards work?</AccordionTrigger>
            <AccordionContent className="text-muted-foreground">
              Creators deposit funds (MOVE or USDC) into a smart contract when creating a poll. These funds are automatically distributed to verified participants once the poll closes or the target response count is reached.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="item-2" className="border border-border/50 rounded-lg px-4 bg-card/30">
            <AccordionTrigger className="hover:no-underline font-medium text-lg">Is my vote public?</AccordionTrigger>
            <AccordionContent className="text-muted-foreground">
              While the transaction is on-chain, we use zero-knowledge proofs to ensure your specific vote choice remains private while still proving you are a unique, valid voter.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="item-3" className="border border-border/50 rounded-lg px-4 bg-card/30">
            <AccordionTrigger className="hover:no-underline font-medium text-lg">What is the platform fee?</AccordionTrigger>
            <AccordionContent className="text-muted-foreground">
              MovePoll charges a small 1% protocol fee on distributed rewards to maintain the platform and fund the ecosystem treasury.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="item-4" className="border border-border/50 rounded-lg px-4 bg-card/30">
            <AccordionTrigger className="hover:no-underline font-medium text-lg">Do I need a wallet to participate?</AccordionTrigger>
            <AccordionContent className="text-muted-foreground">
              Yes, you need a Movement-compatible wallet to sign transactions and receive rewards.
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </section>

      {/* Final CTA */}
      <section className="py-24 container mx-auto px-4">
        <div className="relative rounded-3xl bg-gradient-to-r from-primary/20 via-accent/20 to-primary/20 p-12 text-center overflow-hidden border border-primary/20">
          <div className="absolute inset-0 bg-grid-white/5 [mask-image:linear-gradient(0deg,white,transparent)]" />
          <div className="relative z-10 max-w-2xl mx-auto space-y-8">
            <h2 className="text-4xl md:text-5xl font-display font-bold">Ready to get started?</h2>
            <p className="text-xl text-muted-foreground">Join thousands of communities using MovePoll to make better decisions.</p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" className="text-lg px-8 bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => setLocation('/create')}>
                Launch a Poll
              </Button>
              <Button size="lg" variant="outline" className="text-lg px-8" onClick={() => setLocation('/dashboard?role=participant')}>
                Start Voting
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
