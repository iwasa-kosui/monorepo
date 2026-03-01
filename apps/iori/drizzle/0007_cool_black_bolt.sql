CREATE TABLE "instance_actor_keys" (
	"keyId" uuid PRIMARY KEY NOT NULL,
	"type" varchar(32) NOT NULL,
	"privateKey" text NOT NULL,
	"publicKey" text NOT NULL,
	CONSTRAINT "instance_actor_keys_type_unique" UNIQUE("type")
);
