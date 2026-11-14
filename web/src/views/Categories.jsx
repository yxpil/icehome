import { useState } from 'react';
import { Icon } from '../icons.jsx';
import { Badge, Button, Card, EmptyState, Field, IconButton, Modal, SectionHeader } from '../ui.jsx';
import { useApp } from '../context.js';
import { api } from '../api.js';
import { EntityForm } from '../forms.jsx';

export function CategoriesView() {
  const { state, action, setView } = useApp();
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState({ name: '', icon: 'grid', description: '' });

  const counts = state.devices.reduce((acc, device) => {
    acc[device.categoryId || 'none'] = (acc[device.categoryId || 'none'] || 0) + 1;
    return acc;
  }, {});

  const openNew = () => {
    setEditing({ id: null });
    setDraft({ name: '', icon: 'grid', description: '' });
  };

  const openEdit = (category) => {
    setEditing(category);
    setDraft({ name: category.name, icon: category.icon, description: category.description || '' });
  };

  const submit = async () => {
    const payload = { name: draft.name.trim(), icon: draft.icon, description: draft.description };
    if (!payload.name) return;
    const result = editing.id
      ? await action('分类已更新', () => api.updateCategory(editing.id, payload))
      : await action('分类已创建', () => api.createCategory(payload));
    if (result) setEditing(null);
  };

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        title="设备分类"
        description="左侧导航的分类卡片来源于此，可自由增删改并指定 SVG 图标。"
        action={
          <Button icon="plus" onClick={openNew}>
            新建分类
          </Button>
        }
      />

      {state.categories.length === 0 ? (
        <EmptyState icon="grid" title="还没有分类" description="创建分类后可以把设备归类到左侧卡片。" action={<Button icon="plus" onClick={openNew}>新建分类</Button>} />
      ) : (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {[...state.categories].sort((a, b) => a.order - b.order).map((category) => (
            <Card key={category.id} className="card-hover p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-mist text-slate1">
                    <Icon name={category.icon} size={16} />
                  </div>
                  <div>
                    <div className="text-[13px] font-medium leading-5">{category.name}</div>
                    <div className="mono-tag">排序 {category.order}</div>
                  </div>
                </div>
                <div className="flex items-center gap-0.5">
                  <IconButton icon="pen" label="编辑分类" onClick={() => openEdit(category)} />
                  <IconButton
                    icon="trash"
                    label="删除分类"
                    onClick={async () => {
                      if (!window.confirm(`删除分类「${category.name}」？设备会保留并变为未分类。`)) return;
                      await action('分类已删除', () => api.deleteCategory(category.id));
                    }}
                  />
                </div>
              </div>
              <p className="muted mt-2.5 line-clamp-2 min-h-[20px]">{category.description || '暂无描述'}</p>
              <div className="mt-3 flex items-center justify-between">
                <Badge tone="soft">{counts[category.id] || 0} 台设备</Badge>
                <button
                  type="button"
                  onClick={() => setView({ kind: 'category', id: category.id })}
                  className="inline-flex items-center gap-1 text-[11px] text-muted2 transition-colors hover:text-ink"
                >
                  查看
                  <Icon name="arrowRight" size={12} />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing?.id ? '编辑分类' : '新建分类'}
        description="分类只影响面板组织方式，不会改变设备本身。"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              取消
            </Button>
            <Button icon="check" onClick={submit} disabled={!draft.name.trim()}>
              保存
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <Field label="分类名称">
            <input
              className="input"
              value={draft.name}
              maxLength={20}
              placeholder="例如：书房"
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
          </Field>
          <Field label="描述">
            <input
              className="input"
              value={draft.description}
              placeholder="可选"
              onChange={(event) => setDraft({ ...draft, description: event.target.value })}
            />
          </Field>
          <Field label="图标">
            <EntityForm
              fields={[{ key: 'icon', type: 'icon' }]}
              value={draft}
              onChange={setDraft}
              options={{}}
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
