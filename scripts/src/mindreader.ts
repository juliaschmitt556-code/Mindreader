#!/usr/bin/env node
import { Command } from 'commander';
import { ReasoningEngine } from './reasoning/engine';
import { ResearchEngine } from './research/engine';
import * as fs from 'fs';
import * as path from 'path';

const program = new Command();

program.name('mindreader').description('Reasoning and research CLI for code analysis').version('0.1.0');

/**
 * Reason command: Analyze code changes and provide insights
 */
program
  .command('reason')
  .description('Analyze code and provide reasoning')
  .option('--pr-number <number>', 'GitHub PR number to analyze')
  .option('--repo <repo>', 'Repository (owner/repo)')
  .option('--files <files...>', 'Specific files to analyze')
  .option('--output <path>', 'Output file path', 'analysis-output.md')
  .action(async (options) => {
    try {
      console.log('🧠 Starting reasoning analysis...');
      const engine = new ReasoningEngine();
      const result = await engine.analyzeCode({
        prNumber: options.prNumber,
        repo: options.repo,
        files: options.files,
      });
      
      fs.writeFileSync(options.output, result);
      console.log(`✅ Analysis complete. Output: ${options.output}`);
    } catch (error) {
      console.error('❌ Reasoning failed:', error);
      process.exit(1);
    }
  });

/**
 * Research command: Search and synthesize information
 */
program
  .command('research')
  .description('Conduct research on a topic')
  .option('--query <query>', 'Research query')
  .option('--repo <repo>', 'Repository context (owner/repo)')
  .option('--context <context>', 'Additional context or file path')
  .option('--output <path>', 'Output file path', 'research-output.md')
  .action(async (options) => {
    try {
      console.log('🔍 Starting research...');
      if (!options.query) {
        throw new Error('Query is required. Use --query "<your question>"');
      }
      
      const engine = new ResearchEngine();
      const result = await engine.research({
        query: options.query,
        repo: options.repo,
        context: options.context,
      });
      
      fs.writeFileSync(options.output, result);
      console.log(`✅ Research complete. Output: ${options.output}`);
    } catch (error) {
      console.error('❌ Research failed:', error);
      process.exit(1);
    }
  });

/**
 * Review command: Comprehensive code review
 */
program
  .command('review')
  .description('Perform comprehensive code review')
  .option('--pr-number <number>', 'GitHub PR number')
  .option('--repo <repo>', 'Repository (owner/repo)')
  .option('--output <path>', 'Output file path', 'review-output.md')
  .action(async (options) => {
    try {
      console.log('📋 Starting comprehensive review...');
      const engine = new ReasoningEngine();
      const result = await engine.reviewPR({
        prNumber: options.prNumber,
        repo: options.repo,
      });
      
      fs.writeFileSync(options.output, result);
      console.log(`✅ Review complete. Output: ${options.output}`);
    } catch (error) {
      console.error('❌ Review failed:', error);
      process.exit(1);
    }
  });

program.parse(process.argv);
