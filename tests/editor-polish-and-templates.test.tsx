import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { api } from '../src/services/api';
import { SlideElements } from '../src/components/SlideElements';
import { SlideGrid } from '../src/components/SlideGrid';
import { StageCanvas } from '../src/components/Stage/StageCanvas';
import { StageDisplayView } from '../src/components/Stage/StageDisplayView';
import {
  clampElement,
  snapElementPosition,
  validateElement,
} from '../src/services/slideElements';
import { Presentation, PresentationState, Slide, SlideElement, SlideTemplate } from '../src/types';

afterEach(async () => {
  await api.clearAll();
  const templates = await api.listSlideTemplates();
  for (const t of templates) {
    await api.deleteSlideTemplate(t.id).catch(() => {});
  }
});

const samplePresentation: Presentation = {
  id: 'pres-1',
  title: 'Sunday Worship Deck',
  category: 'Worship',
  createdAt: '',
  updatedAt: '',
};

const sampleSlideWithElements: Slide = {
  id: 'slide-1',
  presentationId: 'pres-1',
  sortOrder: 0,
  title: 'Worship Opening',
  body: 'Holy, Holy, Holy! Lord God Almighty!',
  backgroundColor: '#0a0f1d',
  foregroundColor: '#ffffff',
  fontSize: 'large',
  textAlignment: 'center',
  createdAt: '',
  updatedAt: '',
  layout: {
    elements: [
      {
        id: 'el-text-1',
        kind: 'text',
        x: 10,
        y: 10,
        w: 40,
        h: 20,
        text: 'Special Service 10:00 AM',
        fontSizePct: 8,
        color: '#38bdf8',
        align: 'left',
        weight: 'bold',
        rotation: 15,
      },
      {
        id: 'el-shape-1',
        kind: 'shape',
        x: 60,
        y: 10,
        w: 30,
        h: 20,
        shape: 'rect',
        fill: '#3b82f6',
        opacity: 0.75,
        rotation: -45,
      },
    ],
  },
};

const sampleState: PresentationState = {
  currentPresentationId: 'pres-1',
  currentSlideId: 'slide-1',
  currentSlideIndex: 0,
  totalSlides: 1,
  currentSlide: sampleSlideWithElements,
  nextSlide: null,
  isBlackout: false,
  isLive: true,
};

describe('Phase 9.4: Editor Polish, Handles, Guides & Template Creation', () => {
  it('validates element rotation and clamps degrees properly', () => {
    const valid: SlideElement = {
      id: 'e1',
      kind: 'text',
      x: 10,
      y: 10,
      w: 40,
      h: 20,
      text: 'Sample',
      rotation: 45,
    };
    expect(validateElement(valid)).toBeNull();

    const badRot: SlideElement = {
      ...valid,
      rotation: 400,
    };
    expect(validateElement(badRot)).toContain('rotation must be between -360 and 360');

    // Clamping normalizes rotation into [-180, 180]
    const clamped = clampElement({ ...valid, rotation: 270 });
    expect(clamped.rotation).toBe(-90);
  });

  it('snaps position to slide boundaries (0%, 50%, 100%) and neighbor elements with visual guides', () => {
    const existingElement: SlideElement = {
      id: 'other-1',
      kind: 'shape',
      x: 20,
      y: 20,
      w: 20,
      h: 20,
    };

    // 1. Position near slide center horizontal (50%) with no neighbors -> snap target center = 50%
    // If width = 20, element center is x + 10. When x = 39.5, center is 49.5, within 1.5% of 50%.
    const snapCenter = snapElementPosition(39.5, 10, 20, 20, [], 1.5);
    expect(snapCenter.x).toBe(40); // 40 + 10 = 50%
    expect(snapCenter.guides.some((g) => g.type === 'x' && g.position === 50)).toBe(true);

    // 2. Position near existing neighbor element right edge (x = 40%)
    const snapNeighbor = snapElementPosition(40.8, 10, 20, 20, [existingElement], 1.5);
    expect(snapNeighbor.x).toBe(40); // Snaps flush to neighbor right edge
    expect(snapNeighbor.guides.some((g) => g.type === 'x' && g.position === 40)).toBe(true);
  });

  it('SlideElements renders 8 resize handles, rotate handle and rotation transform when selected', () => {
    const onHandlePointerDown = vi.fn();
    const onSelect = vi.fn();

    const elements: SlideElement[] = [
      {
        id: 'el-1',
        kind: 'text',
        x: 15,
        y: 20,
        w: 50,
        h: 25,
        text: 'Rotated Text',
        rotation: 30,
      },
    ];

    render(
      <SlideElements
        elements={elements}
        interactive={true}
        selectedId="el-1"
        onSelect={onSelect}
        onHandlePointerDown={onHandlePointerDown}
        guides={[{ type: 'x', position: 50 }, { type: 'y', position: 50 }]}
      />
    );

    // Verify rotation transform applied
    const elNode = screen.getByTestId('slide-element');
    expect(elNode.style.transform).toBe('rotate(30deg)');

    // Verify rotate handle exists and handles pointer down
    const rotHandle = screen.getByTestId('element-handle-rot');
    expect(rotHandle).toBeTruthy();
    fireEvent.pointerDown(rotHandle);
    expect(onHandlePointerDown).toHaveBeenCalledWith('el-1', 'rot', expect.anything());

    // Verify 8 resize handles exist
    for (const h of ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']) {
      const handle = screen.getByTestId(`element-handle-${h}`);
      expect(handle).toBeTruthy();
    }

    // Verify alignment guides are rendered
    expect(screen.getByTestId('snap-guide-x')).toBeTruthy();
    expect(screen.getByTestId('snap-guide-y')).toBeTruthy();
  });

  it('renders rich slide elements on StageCanvas and StageDisplayView confidence monitors', async () => {
    // 1. StageCanvas custom layout
    render(
      <StageCanvas
        panels={[
          { id: 'p1', kind: 'current', x: 0, y: 0, w: 100, h: 100, fontSizePct: 5 },
        ]}
        state={sampleState}
        clock="10:30:00"
        timer={{ display: '00:00', isWarning: false, isExpired: false }}
        highContrast={true}
      />
    );

    // Elements should be rendered inside StageCanvas
    await waitFor(() => {
      expect(screen.getByText('Special Service 10:00 AM')).toBeTruthy();
    });

    // 2. StageDisplayView
    await api.setLiveSlide(samplePresentation.id, sampleSlideWithElements.id);
    render(<StageDisplayView previewMode={true} />);

    await waitFor(() => {
      expect(screen.getAllByText('Special Service 10:00 AM').length).toBeGreaterThan(0);
    });
  });

  it('SlideGrid allows creating a new slide from template with layout and element presets', async () => {
    // Create a saved slide template in api
    const template: SlideTemplate = await api.createSlideTemplate({
      id: 'tpl-sermon',
      name: 'Scripture Lower-Third',
      backgroundColor: '#0f172a',
      foregroundColor: '#f8fafc',
      fontSize: 'large',
      textAlignment: 'left',
      backgroundImage: null,
      sortOrder: 0,
      createdAt: '',
      updatedAt: '',
      layout: {
        outlineWidth: 2,
        outlineColor: '#000000',
        elements: [
          {
            id: 'tpl-el-1',
            kind: 'shape',
            x: 5,
            y: 75,
            w: 90,
            h: 20,
            shape: 'rect',
            fill: '#1e3a5f',
            opacity: 0.9,
          },
        ],
      },
    });

    const onAddSlideSpy = vi.fn();
    const onAddFromTemplateSpy = vi.fn();

    render(
      <SlideGrid
        presentation={samplePresentation}
        slides={[]}
        presentationState={sampleState}
        onGoLive={vi.fn()}
        onEditSlide={vi.fn()}
        onAddSlide={onAddSlideSpy}
        onAddSlideFromTemplate={onAddFromTemplateSpy}
        onDuplicateSlide={vi.fn()}
        onDeleteSlide={vi.fn()}
        onReorderSlides={vi.fn()}
      />
    );

    // Open template dropdown menu
    const fromTemplateBtn = screen.getByTestId('new-slide-from-template-btn');
    expect(fromTemplateBtn).toBeTruthy();
    fireEvent.click(fromTemplateBtn);

    // Verify template option is displayed
    await waitFor(() => {
      expect(screen.getByTestId(`template-option-${template.id}`)).toBeTruthy();
      expect(screen.getByText('Scripture Lower-Third')).toBeTruthy();
    });

    // Click template option
    fireEvent.click(screen.getByTestId(`template-option-${template.id}`));
    expect(onAddFromTemplateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        id: template.id,
        name: 'Scripture Lower-Third',
      })
    );
  });
});
