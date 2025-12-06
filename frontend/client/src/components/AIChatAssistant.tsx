import { useState, useRef, useEffect } from "react";
import { Bot, Send, X, Sparkles, Rocket, Edit2, Clock, Coins, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";

// Poll generation types
interface GeneratedPoll {
  title: string;
  description: string;
  category: string;
  options: string[];
  duration: string; // "1h" | "24h" | "3d" | "1w"
  rewardType: number; // 0=none, 1=fixed, 2=equal_split
  selectedToken: number; // 0=MOVE, 1=PULSE
  totalFund: number;
  maxResponders: number;
  rewardPerVoter?: number;
}

interface Message {
  id: string;
  role: "user" | "ai";
  content: string;
  poll?: GeneratedPoll;
}

// Duration labels for display
const DURATION_LABELS: Record<string, string> = {
  "1h": "1 Hour",
  "24h": "24 Hours",
  "3d": "3 Days",
  "1w": "1 Week",
};

const TOKEN_LABELS: Record<number, string> = {
  0: "MOVE",
  1: "PULSE",
};

const REWARD_TYPE_LABELS: Record<number, string> = {
  0: "No Rewards",
  1: "Fixed Per Vote",
  2: "Equal Split",
};

// Example prompts to show users
const EXAMPLE_PROMPTS = [
  "Create a poll asking what feature to build next on MVPulse with 10 PULSE split equally among 50 voters for 1 week",
  "Generate a governance poll about treasury allocation with MOVE rewards",
  "Make a quick 24-hour poll about community preferences with no rewards",
];

export function AIChatAssistant() {
  const [, setLocation] = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      role: "ai",
      content: `Hi! I'm your MoveAI Poll Generator. I can create polls from natural language prompts.

**Try saying something like:**
• "${EXAMPLE_PROMPTS[0]}"
• "${EXAMPLE_PROMPTS[1]}"

Just describe your poll and I'll generate it for you!`,
    },
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [currentPoll, setCurrentPoll] = useState<GeneratedPoll | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen]);

  // Parse natural language prompt to extract poll parameters
  const parsePollFromPrompt = (prompt: string): GeneratedPoll => {
    const lowerPrompt = prompt.toLowerCase();

    // Extract title/topic
    let title = "Community Poll";
    let description = prompt;

    // Try to extract what the poll is about
    const aboutMatch = prompt.match(/(?:poll|asking|about|regarding|for)\s+(?:what|which|how|whether|if)?\s*(.+?)(?:\s+with|\s+for|\s+running|\s+I want|$)/i);
    if (aboutMatch) {
      const topic = aboutMatch[1].trim();
      title = topic.length > 50 ? topic.substring(0, 50) + "..." : topic;
      description = `Poll: ${topic}`;
    }

    // Extract duration
    let duration = "24h";
    if (lowerPrompt.includes("1 week") || lowerPrompt.includes("one week") || lowerPrompt.includes("7 day")) {
      duration = "1w";
    } else if (lowerPrompt.includes("3 day") || lowerPrompt.includes("three day")) {
      duration = "3d";
    } else if (lowerPrompt.includes("1 hour") || lowerPrompt.includes("one hour") || lowerPrompt.includes("quick")) {
      duration = "1h";
    } else if (lowerPrompt.includes("24 hour") || lowerPrompt.includes("1 day") || lowerPrompt.includes("one day")) {
      duration = "24h";
    }

    // Extract token type
    let selectedToken = 0; // Default MOVE
    if (lowerPrompt.includes("pulse")) {
      selectedToken = 1;
    }

    // Extract reward amount
    let totalFund = 0;
    let rewardType = 0; // No rewards by default
    const amountMatch = prompt.match(/(\d+(?:\.\d+)?)\s*(?:pulse|move|tokens?)/i);
    if (amountMatch) {
      totalFund = parseFloat(amountMatch[1]);
      rewardType = 2; // Equal split by default when amount specified
    }

    // Check for reward distribution type
    if (lowerPrompt.includes("fixed per") || lowerPrompt.includes("per vote") || lowerPrompt.includes("per voter")) {
      rewardType = 1;
    } else if (lowerPrompt.includes("equal") || lowerPrompt.includes("split") || lowerPrompt.includes("shared")) {
      rewardType = 2;
    } else if (lowerPrompt.includes("no reward") || lowerPrompt.includes("without reward")) {
      rewardType = 0;
      totalFund = 0;
    }

    // Extract max responders/voters
    let maxResponders = 100; // Default
    const voterMatch = prompt.match(/(\d+)\s*(?:voters?|responders?|participants?|people)/i);
    if (voterMatch) {
      maxResponders = parseInt(voterMatch[1]);
    }

    // Extract category
    let category = "community";
    if (lowerPrompt.includes("governance") || lowerPrompt.includes("treasury") || lowerPrompt.includes("proposal")) {
      category = "governance";
    } else if (lowerPrompt.includes("product") || lowerPrompt.includes("feature") || lowerPrompt.includes("build")) {
      category = "product";
    }

    // Generate sensible default options based on topic
    let options = ["Option A", "Option B", "Option C"];
    if (lowerPrompt.includes("yes") || lowerPrompt.includes("approve") || lowerPrompt.includes("should we")) {
      options = ["Yes, approve", "No, reject", "Abstain"];
    } else if (lowerPrompt.includes("feature") || lowerPrompt.includes("build")) {
      options = ["Feature A", "Feature B", "Feature C", "Other"];
    } else if (lowerPrompt.includes("prefer") || lowerPrompt.includes("choose")) {
      options = ["Option 1", "Option 2", "Neither"];
    }

    return {
      title,
      description,
      category,
      options,
      duration,
      rewardType,
      selectedToken,
      totalFund,
      maxResponders,
      rewardPerVoter: rewardType === 1 && maxResponders > 0 ? totalFund / maxResponders : undefined,
    };
  };

  // Generate AI response based on user input
  const generateResponse = (userMessage: string, existingPoll: GeneratedPoll | null): { content: string; poll?: GeneratedPoll } => {
    const lowerMsg = userMessage.toLowerCase();

    // Check if user is modifying existing poll
    if (existingPoll) {
      let modifiedPoll = { ...existingPoll };
      let modifications: string[] = [];

      // Check for title changes
      if (lowerMsg.includes("change title") || lowerMsg.includes("rename")) {
        const titleMatch = userMessage.match(/(?:to|as)\s*[""']?(.+?)[""']?$/i);
        if (titleMatch) {
          modifiedPoll.title = titleMatch[1].trim();
          modifications.push(`title to "${modifiedPoll.title}"`);
        }
      }

      // Check for duration changes
      if (lowerMsg.includes("1 week") || lowerMsg.includes("7 day")) {
        modifiedPoll.duration = "1w";
        modifications.push("duration to 1 week");
      } else if (lowerMsg.includes("3 day")) {
        modifiedPoll.duration = "3d";
        modifications.push("duration to 3 days");
      } else if (lowerMsg.includes("24 hour") || lowerMsg.includes("1 day")) {
        modifiedPoll.duration = "24h";
        modifications.push("duration to 24 hours");
      } else if (lowerMsg.includes("1 hour")) {
        modifiedPoll.duration = "1h";
        modifications.push("duration to 1 hour");
      }

      // Check for reward changes
      const newAmountMatch = userMessage.match(/(\d+(?:\.\d+)?)\s*(?:pulse|move)/i);
      if (newAmountMatch) {
        modifiedPoll.totalFund = parseFloat(newAmountMatch[1]);
        modifications.push(`reward to ${modifiedPoll.totalFund} ${TOKEN_LABELS[modifiedPoll.selectedToken]}`);
      }

      // Check for token type changes
      if (lowerMsg.includes("use move") || lowerMsg.includes("change to move")) {
        modifiedPoll.selectedToken = 0;
        modifications.push("token to MOVE");
      } else if (lowerMsg.includes("use pulse") || lowerMsg.includes("change to pulse")) {
        modifiedPoll.selectedToken = 1;
        modifications.push("token to PULSE");
      }

      // Check for voter count changes
      const newVoterMatch = userMessage.match(/(\d+)\s*(?:voters?|responders?|participants?)/i);
      if (newVoterMatch) {
        modifiedPoll.maxResponders = parseInt(newVoterMatch[1]);
        modifications.push(`max responders to ${modifiedPoll.maxResponders}`);
      }

      // Check for adding/changing options
      if (lowerMsg.includes("add option")) {
        const optionMatch = userMessage.match(/add option\s*[""']?(.+?)[""']?$/i);
        if (optionMatch) {
          modifiedPoll.options = [...modifiedPoll.options, optionMatch[1].trim()];
          modifications.push(`added option "${optionMatch[1].trim()}"`);
        }
      }

      if (modifications.length > 0) {
        return {
          content: `I've updated the poll: ${modifications.join(", ")}. Here's the updated preview:`,
          poll: modifiedPoll,
        };
      }

      // If no modifications detected but there's a poll, ask what to change
      if (lowerMsg.includes("change") || lowerMsg.includes("modify") || lowerMsg.includes("update")) {
        return {
          content: "What would you like to change? You can modify:\n• Title\n• Duration (1h, 24h, 3d, 1w)\n• Reward amount\n• Token type (MOVE/PULSE)\n• Number of voters\n• Poll options",
          poll: existingPoll,
        };
      }
    }

    // Check if this is a poll generation request
    if (lowerMsg.includes("poll") || lowerMsg.includes("create") || lowerMsg.includes("generate") || lowerMsg.includes("make")) {
      const poll = parsePollFromPrompt(userMessage);
      return {
        content: "I've generated a poll based on your description. Review the preview below and click **Launch Poll** when ready, or tell me what to change!",
        poll,
      };
    }

    // Help/guidance responses
    if (lowerMsg.includes("help") || lowerMsg.includes("how")) {
      return {
        content: `I can generate polls from natural language! Just describe what you want:

**Example prompts:**
• "Create a poll about the next community event with 5 PULSE rewards split among voters for 1 week"
• "Make a quick governance poll about treasury spending"
• "Generate a product feedback poll with no rewards"

Include details like duration, rewards, and token type - or I'll use sensible defaults!`,
      };
    }

    // Default response - encourage poll creation
    return {
      content: "I'm here to help you create polls! Try describing what you want, like:\n\n\"Create a poll asking users their favorite feature with 10 PULSE split equally for 1 week\"\n\nI'll generate a preview you can launch or modify.",
    };
  };

  const handleSend = () => {
    if (!input.trim()) return;

    const userMsg: Message = { id: Date.now().toString(), role: "user", content: input };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsTyping(true);

    // Generate response
    setTimeout(() => {
      const response = generateResponse(userMsg.content, currentPoll);
      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "ai",
        content: response.content,
        poll: response.poll,
      };
      setMessages((prev) => [...prev, aiMsg]);
      if (response.poll) {
        setCurrentPoll(response.poll);
      }
      setIsTyping(false);
    }, 1000);
  };

  const handleLaunchPoll = (poll: GeneratedPoll) => {
    // Store poll data in sessionStorage for the CreatePoll page to pick up
    sessionStorage.setItem("ai-generated-poll", JSON.stringify(poll));
    setIsOpen(false);
    setLocation("/create?from=ai");
  };

  // Poll Preview Component
  const PollPreview = ({ poll }: { poll: GeneratedPoll }) => (
    <div className="mt-3 p-3 rounded-lg bg-background border border-border/50 space-y-3">
      <div className="font-medium text-sm">{poll.title}</div>
      <p className="text-xs text-muted-foreground line-clamp-2">{poll.description}</p>

      <div className="flex flex-wrap gap-2">
        <Badge variant="outline" className="text-xs gap-1">
          <Clock className="w-3 h-3" />
          {DURATION_LABELS[poll.duration]}
        </Badge>
        <Badge variant="outline" className="text-xs gap-1">
          <Users className="w-3 h-3" />
          {poll.maxResponders} voters
        </Badge>
        {poll.rewardType !== 0 && (
          <Badge variant="secondary" className="text-xs gap-1">
            <Coins className="w-3 h-3" />
            {poll.totalFund} {TOKEN_LABELS[poll.selectedToken]}
          </Badge>
        )}
      </div>

      <div className="space-y-1">
        <div className="text-xs text-muted-foreground">Options:</div>
        <div className="flex flex-wrap gap-1">
          {poll.options.map((opt, i) => (
            <Badge key={i} variant="outline" className="text-xs">
              {opt}
            </Badge>
          ))}
        </div>
      </div>

      <div className="flex gap-2 pt-2">
        <Button
          size="sm"
          className="flex-1 gap-1"
          onClick={() => handleLaunchPoll(poll)}
        >
          <Rocket className="w-3 h-3" />
          Launch Poll
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="gap-1"
          onClick={() => setInput("Change ")}
        >
          <Edit2 className="w-3 h-3" />
          Modify
        </Button>
      </div>
    </div>
  );

  return (
    <>
      {/* Toggle Button */}
      <Button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "fixed bottom-20 md:bottom-8 right-4 md:right-8 rounded-full w-14 h-14 shadow-2xl z-50 transition-all duration-300 hover:scale-110",
          isOpen ? "bg-destructive rotate-45" : "bg-gradient-to-r from-primary to-accent animate-pulse hover:animate-none"
        )}
        data-testid="btn-ai-chat"
      >
        {isOpen ? <PlusCircleIcon className="w-6 h-6 text-white" /> : <Bot className="w-8 h-8 text-primary-foreground" />}
      </Button>

      {/* Chat Window */}
      <div
        className={cn(
          "fixed bottom-36 md:bottom-24 right-4 md:right-8 w-[90vw] md:w-[420px] h-[550px] z-40 transition-all duration-300 origin-bottom-right",
          isOpen ? "scale-100 opacity-100" : "scale-0 opacity-0 pointer-events-none"
        )}
      >
        <Card className="w-full h-full flex flex-col overflow-hidden border-primary/20 shadow-2xl bg-background/95 backdrop-blur-xl">
          <div className="p-4 border-b border-border bg-primary/5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              <h3 className="font-bold font-display">MoveAI Poll Generator</h3>
            </div>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsOpen(false)}>
              <X className="w-4 h-4" />
            </Button>
          </div>

          <ScrollArea className="flex-1 p-4">
            <div className="space-y-4">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={cn(
                    "flex w-full",
                    msg.role === "user" ? "justify-end" : "justify-start"
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[90%] p-3 rounded-2xl text-sm",
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground rounded-br-none"
                        : "bg-muted text-foreground rounded-bl-none"
                    )}
                  >
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                    {msg.poll && <PollPreview poll={msg.poll} />}
                  </div>
                </div>
              ))}
              {isTyping && (
                <div className="flex justify-start">
                  <div className="bg-muted p-3 rounded-2xl rounded-bl-none flex gap-1 items-center">
                    <span className="w-2 h-2 bg-foreground/40 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-2 h-2 bg-foreground/40 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-2 h-2 bg-foreground/40 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              )}
              <div ref={scrollRef} />
            </div>
          </ScrollArea>

          <div className="p-4 border-t border-border bg-background">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="flex gap-2"
            >
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Describe your poll..."
                className="bg-muted/50 border-transparent focus-visible:ring-primary"
              />
              <Button type="submit" size="icon" disabled={!input.trim() || isTyping}>
                <Send className="w-4 h-4" />
              </Button>
            </form>
          </div>
        </Card>
      </div>
    </>
  );
}

function PlusCircleIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </svg>
  );
}
