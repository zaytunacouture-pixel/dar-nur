// Déclaration minimale de Deno pour vérifier les types des Edge Functions sous Node (étape 11).
declare const Deno: {
  serve(handler: (request: Request) => Response | Promise<Response>): unknown;
  env: { get(name: string): string | undefined };
};
