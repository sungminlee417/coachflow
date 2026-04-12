"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client"; // supabase client

type ChatBoxProps = {
  clientId: string;
};
// get Current user
// I need supabase client
export default function ChatBox({ clientId }: ChatBoxProps) {
  const supabase = createClient();

  const [conversationId, setConversationId] = useState<String | null>(null);
  console.log("conversationId:", conversationId);
  useEffect(() => {
    const setupConversation = async () => {
      // get current user
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      // find existing conversation
      const { data: existingConversation } = await supabase
        .from("conversations")
        .select("*")
        .eq("coach_id", user.id)
        .eq("client_id", clientId)
        .maybeSingle(); // expects only 1 result and returns null if none

      let conversationId;

      // create if not exists
      if (existingConversation) {
        conversationId = existingConversation.id;
      } else {
        const { data: newConversation } = await supabase
          .from("conversations")
          .insert({
            coach_id: user.id,
            client_id: clientId,
          })
          .select()
          .single();

        conversationId = newConversation.id;
      }
      // save to state
      setConversationId(conversationId);
    };
    setupConversation();
  }, [clientId]);
  return <div>ChatBox</div>;
}
