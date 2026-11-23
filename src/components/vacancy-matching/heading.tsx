import { createContext, useContext, type HTMLAttributes } from 'react';

/**
 * Nível dos títulos dos painéis: h2 quando o projeto é a página (/projetos/vagas),
 * h3 quando ele está embutido abaixo de um h2 (/projetos). Mantém a ordem dos títulos.
 */
export const HeadingLevel = createContext<'h2' | 'h3'>('h3');

export function Heading(props: HTMLAttributes<HTMLHeadingElement>) {
  const Tag = useContext(HeadingLevel);
  return <Tag {...props} />;
}
