/**
 * <sf-items>: makes a list of items interactive and records progress.
 *
 * Attributes:
 *   data-lesson     lesson id
 *   data-block      block id
 *   data-mode       "quiz" (progress per item) or "practice" (progress per block)
 * Practice only:
 *   data-generator, data-params (JSON), data-count
 */
import { generateSet } from '../generators';
import { formatNumber } from '../lib/format';
import { getCurrentLearner, getLessonProgress, recordItem, recordPractice } from '../lib/progress';
import type { Item } from '../model/schemas';
import { answerText, isCorrect } from './grading';
import { plainItemHtml } from './render';

const MAX_WRONG = 2;

class SfItems extends HTMLElement {
  private wrong = new Map<string, number>();

  connectedCallback(): void {
    this.addEventListener('click', this.onClick);
    this.addEventListener('submit', this.onSubmit);
    this.restore();
    this.updateScore();
    window.addEventListener('studyflix:progress', this.refresh);
    window.addEventListener('storage', this.refresh);
  }

  disconnectedCallback(): void {
    window.removeEventListener('studyflix:progress', this.refresh);
    window.removeEventListener('storage', this.refresh);
  }

  /** Progress changed (an answer here, another tab, or a sync from another device). */
  private refresh = (): void => {
    this.restore();
    this.updateScore();
  };

  private get lessonId(): string {
    return this.dataset.lesson ?? '';
  }

  private get blockId(): string {
    return this.dataset.block ?? '';
  }

  private get isPractice(): boolean {
    return this.dataset.mode === 'practice';
  }

  private onClick = (event: Event): void => {
    const target = event.target as HTMLElement;
    const choice = target.closest<HTMLButtonElement>('button.choice');
    if (choice && !choice.disabled) {
      const li = choice.closest<HTMLLIElement>('li.item');
      if (li) this.answer(li, choice.dataset.value ?? '', choice);
      return;
    }
    if (target.closest('[data-action="new-set"]')) this.newSet();
  };

  private onSubmit = (event: Event): void => {
    const form = event.target as HTMLFormElement;
    if (!form.classList.contains('item-answer')) return;
    event.preventDefault();
    const input = form.elements.namedItem('answer') as HTMLInputElement;
    const li = form.closest<HTMLLIElement>('li.item');
    if (!li || input.value.trim() === '') {
      input.focus();
      return;
    }
    this.answer(li, input.value);
  };

  private answer(li: HTMLLIElement, response: string, choice?: HTMLButtonElement): void {
    const item = JSON.parse(li.dataset.item ?? '{}') as Item;
    const key = li.dataset.key ?? '';
    const correct = isCorrect(item, response);
    const learner = getCurrentLearner();
    const wrongSoFar = this.wrong.get(key) ?? 0;

    if (correct) {
      choice?.classList.add('is-correct');
      this.lock(li, 'correct', 'Correct!');
      if (learner && this.isPractice) recordPractice(learner, this.lessonId, this.blockId, wrongSoFar === 0);
    } else if (wrongSoFar + 1 >= MAX_WRONG) {
      choice?.classList.add('is-wrong');
      this.lock(li, 'revealed', `The answer is ${answerText(item)}.`);
      if (learner && this.isPractice) recordPractice(learner, this.lessonId, this.blockId, false);
    } else {
      this.wrong.set(key, wrongSoFar + 1);
      li.dataset.state = 'wrong';
      if (choice) {
        choice.classList.add('is-wrong');
        choice.disabled = true;
      }
      this.feedback(li, 'Not quite. Try again.');
      li.querySelector<HTMLInputElement>('input')?.select();
    }
    // Record after the item shows its state: recording fires `studyflix:progress`, and restore()
    // must see this item as already answered so it keeps "Correct!" rather than "You already got this one."
    if (learner && !this.isPractice) recordItem(learner, this.lessonId, `${this.blockId}:${key}`, correct);
    this.updateScore();
  }

  private lock(li: HTMLLIElement, state: 'correct' | 'revealed', message: string): void {
    li.dataset.state = state;
    for (const button of li.querySelectorAll<HTMLButtonElement>('button')) button.disabled = true;
    const input = li.querySelector<HTMLInputElement>('input');
    if (input) input.readOnly = true;
    if (state === 'revealed') {
      const item = JSON.parse(li.dataset.item ?? '{}') as Item;
      if (item.kind === 'choice') {
        for (const button of li.querySelectorAll<HTMLButtonElement>('button.choice')) {
          if (button.dataset.value === item.answer) button.classList.add('is-answer');
        }
      }
    }
    this.feedback(li, message);
    li.querySelector<HTMLElement>('.item-explanation')?.removeAttribute('hidden');
  }

  private feedback(li: HTMLLIElement, message: string): void {
    const el = li.querySelector<HTMLElement>('.item-feedback');
    if (el) el.textContent = message;
  }

  /**
   * Show quiz items this learner already answered correctly. Items the learner has touched on this
   * page (any `data-state`) are left alone, so their feedback is never overwritten.
   */
  private restore(): void {
    const learner = getCurrentLearner();
    if (!learner || this.isPractice) return;
    const progress = getLessonProgress(learner, this.lessonId);
    for (const li of this.querySelectorAll<HTMLLIElement>('li.item')) {
      if (li.dataset.state) continue;
      if (!progress.items[`${this.blockId}:${li.dataset.key}`]?.correct) continue;
      const item = JSON.parse(li.dataset.item ?? '{}') as Item;
      const input = li.querySelector<HTMLInputElement>('input');
      // The unit is shown after the box, so restore only the number a learner would have typed.
      if (input) input.value = item.kind === 'number' ? formatNumber(item.answer) : answerText(item);
      for (const button of li.querySelectorAll<HTMLButtonElement>('button.choice')) {
        if (button.dataset.value === (item.kind === 'choice' ? item.answer : ''))
          button.classList.add('is-correct');
      }
      this.lock(li, 'correct', 'You already got this one.');
    }
  }

  private newSet(): void {
    const list = this.querySelector('ol.items');
    if (!list) return;
    const set = generateSet(
      this.dataset.generator ?? '',
      JSON.parse(this.dataset.params ?? '{}'),
      Number(this.dataset.count ?? 6),
      `${this.lessonId}:${Date.now()}:${Math.random()}`,
    );
    this.wrong.clear();
    list.innerHTML = set.map(({ key, item }, i) => plainItemHtml(key, item, i)).join('');
    this.updateScore();
    list.querySelector<HTMLElement>('button, input')?.focus();
  }

  private updateScore(): void {
    const score = this.querySelector<HTMLElement>('[data-score]');
    if (!score) return;
    const items = [...this.querySelectorAll<HTMLLIElement>('li.item')];
    const correct = items.filter((li) => li.dataset.state === 'correct').length;
    const finished = items.filter(
      (li) => li.dataset.state === 'correct' || li.dataset.state === 'revealed',
    ).length;
    score.textContent = `${correct} of ${items.length} correct`;
    this.toggleAttribute('data-finished', finished === items.length);
  }
}

if (!customElements.get('sf-items')) customElements.define('sf-items', SfItems);
