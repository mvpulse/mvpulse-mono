import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Clock, Users, Trophy, ArrowRight } from "lucide-react";
import { Link } from "wouter";

interface PollProps {
  id: string;
  title: string;
  description: string;
  votes: number;
  timeLeft: string;
  reward?: string;
  status: "active" | "closed" | "draft";
  tags: string[];
  hasVoted?: boolean;
}

export function PollCard({ id, title, description, votes, timeLeft, reward, status, tags, hasVoted }: PollProps) {
  // Show "View Results" if user has voted or poll is closed
  const buttonText = hasVoted || status === "closed" ? "View Results" : "Participate";

  return (
    <Card className="group relative overflow-hidden border-border/50 hover:border-primary/50 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5 bg-card/50 backdrop-blur-sm">
      {status === "active" && (
        <div className="absolute top-0 right-0 w-16 h-16 bg-primary/10 rounded-bl-full -mr-8 -mt-8 transition-all group-hover:bg-primary/20" />
      )}
      
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start mb-2">
          <div className="flex gap-2 flex-wrap">
            {tags.map(tag => (
              <Badge key={tag} variant="secondary" className="text-[10px] uppercase tracking-wider font-bold bg-muted/50 text-muted-foreground border-transparent">
                {tag}
              </Badge>
            ))}
          </div>
          {reward && (
            <Badge variant="outline" className="border-primary/30 text-primary bg-primary/5 flex items-center gap-1">
              <Trophy className="w-3 h-3" />
              {reward}
            </Badge>
          )}
        </div>
        <CardTitle className="text-xl font-display leading-tight group-hover:text-primary transition-colors">
          {title}
        </CardTitle>
      </CardHeader>
      
      <CardContent className="pb-4">
        <p className="text-muted-foreground text-sm line-clamp-2 mb-4">
          {description}
        </p>
        
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {votes} votes</span>
            <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {timeLeft}</span>
          </div>
          <Progress value={65} className="h-1" />
        </div>
      </CardContent>
      
      <CardFooter className="pt-0">
        <Link href={`/poll/${id}`}>
          <Button className="w-full group-hover:bg-primary group-hover:text-primary-foreground transition-all" variant="secondary">
            {buttonText} <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
          </Button>
        </Link>
      </CardFooter>
    </Card>
  );
}
