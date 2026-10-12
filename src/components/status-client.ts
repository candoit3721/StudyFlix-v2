/**
 * <sf-lesson-status>: shows the current learner's progress on a lesson.
 * Fills [data-bar], [data-label] and [data-done] inside it, and exposes
 * `data-state` ("new" | "started" | "complete") for <sf-continue>.
 */
import { getCurrentLearner, type LessonRequirements, lessonStatus } from '../lib/progress';

class SfLessonStatus extends HTMLElement {
  connectedCallback(): void {
    this.update();
    window.addEventListener('studyflix:progress', this.update);
    window.addEventListener('storage', this.update);
  }

  disconnectedCallback(): void {
    window.removeEventListener('studyflix:progress', this.update);
    window.removeEventListener('storage', this.update);
  }

  private update = (): void => {
    const learner = getCurrentLearner();
    if (!learner) {
      const label = this.querySelector<HTMLElement>('[data-label]');
      if (label && this.hasAttribute('data-explain-guest')) {
        label.textContent = 'Choose who is learning on the home page to save progress';
      }
      return;
    }
    const requirements = JSON.parse(this.dataset.requirements ?? '{}') as LessonRequirements;
    const status = lessonStatus(learner, this.dataset.lesson ?? '', requirements);
    this.dataset.state = status.complete ? 'complete' : status.started ? 'started' : 'new';

    const bar = this.querySelector<HTMLElement>('[data-bar]');
    if (bar) {
      bar.hidden = !status.started;
      bar.style.setProperty('--value', `${Math.round((status.done / Math.max(status.total, 1)) * 100)}%`);
    }
    const label = this.querySelector<HTMLElement>('[data-label]');
    if (label) {
      label.dataset.initial ??= label.textContent ?? '';
      label.textContent = status.started ? `${status.done} of ${status.total} done` : label.dataset.initial;
    }
    const done = this.querySelector<HTMLElement>('[data-done]');
    if (done) done.hidden = !status.complete;
  };
}

if (!customElements.get('sf-lesson-status')) customElements.define('sf-lesson-status', SfLessonStatus);
