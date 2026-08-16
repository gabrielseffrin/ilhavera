CREATE TABLE "game_results" (
	"room_id" uuid PRIMARY KEY NOT NULL,
	"winner_id" uuid,
	"scores" jsonb NOT NULL,
	"turns" integer NOT NULL,
	"duration_s" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "game_results" ADD CONSTRAINT "game_results_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_results" ADD CONSTRAINT "game_results_winner_id_players_id_fk" FOREIGN KEY ("winner_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;