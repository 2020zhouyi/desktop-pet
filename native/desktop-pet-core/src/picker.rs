use crate::library::PetRecord;

pub const PICKER_PAGE_SIZE: usize = 8;

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct PickerState {
    query: String,
    page_index: usize,
    confirmed_pet_id: Option<String>,
    draft_pet_id: Option<String>,
}

#[derive(Debug)]
pub struct PickerView<'a> {
    pub confirmed_pet_id: Option<&'a str>,
    pub draft_pet_id: Option<&'a str>,
    pub filtered_count: usize,
    pub page_index: usize,
    pub page_count: usize,
    pub visible_pets: Vec<&'a PetRecord>,
}

impl PickerState {
    pub fn new(selected_pet_id: Option<&str>) -> Self {
        Self {
            query: String::new(),
            page_index: 0,
            confirmed_pet_id: selected_pet_id.map(str::to_string),
            draft_pet_id: selected_pet_id.map(str::to_string),
        }
    }

    pub fn query(&self) -> &str {
        &self.query
    }

    pub fn set_query(&mut self, query: impl Into<String>) {
        self.query = query.into();
        self.page_index = 0;
    }

    pub fn sync_pets(&mut self, pets: &[PetRecord]) {
        if !contains_pet(pets, self.confirmed_pet_id.as_deref()) {
            self.confirmed_pet_id = None;
        }
        if !contains_pet(pets, self.draft_pet_id.as_deref()) {
            self.draft_pet_id.clone_from(&self.confirmed_pet_id);
        }
        self.reveal_draft_or_clamp(pets);
    }

    pub fn preview_pet(&mut self, pets: &[PetRecord], runtime_id: &str) -> bool {
        if !pets.iter().any(|pet| pet.runtime_id == runtime_id) {
            return false;
        }
        self.draft_pet_id = Some(runtime_id.to_string());
        self.reveal_draft_or_clamp(pets);
        true
    }

    pub fn mark_confirmed(&mut self, pets: &[PetRecord], runtime_id: Option<&str>) {
        self.confirmed_pet_id = runtime_id
            .filter(|runtime_id| pets.iter().any(|pet| pet.runtime_id == *runtime_id))
            .map(str::to_string);
        self.draft_pet_id.clone_from(&self.confirmed_pet_id);
        self.reveal_draft_or_clamp(pets);
    }

    pub fn confirmation_candidate<'a>(&self, pets: &'a [PetRecord]) -> Option<&'a str> {
        let draft_pet_id = self.draft_pet_id.as_deref()?;
        if self.confirmed_pet_id.as_deref() == Some(draft_pet_id) {
            return None;
        }
        pets.iter()
            .find(|pet| pet.runtime_id == draft_pet_id)
            .map(|pet| pet.runtime_id.as_str())
    }

    pub fn previous_page(&mut self, pets: &[PetRecord]) {
        self.page_index = self.page_index.saturating_sub(1);
        self.clamp_page(pets);
    }

    pub fn next_page(&mut self, pets: &[PetRecord]) {
        self.page_index = self.page_index.saturating_add(1);
        self.clamp_page(pets);
    }

    pub fn view<'a>(&'a self, pets: &'a [PetRecord]) -> PickerView<'a> {
        let filtered = filtered_pets(pets, &self.query);
        let page_count = page_count(filtered.len());
        let page_index = self.page_index.min(page_count - 1);
        let visible_start = visible_start(filtered.len(), page_index, page_count);
        let visible_pets = filtered
            .iter()
            .skip(visible_start)
            .take(PICKER_PAGE_SIZE)
            .copied()
            .collect();
        let confirmed_pet_id = matching_id(pets, self.confirmed_pet_id.as_deref());
        let draft_pet_id = matching_id(pets, self.draft_pet_id.as_deref()).or(confirmed_pet_id);

        PickerView {
            confirmed_pet_id,
            draft_pet_id,
            filtered_count: filtered.len(),
            page_index,
            page_count,
            visible_pets,
        }
    }

    fn reveal_draft_or_clamp(&mut self, pets: &[PetRecord]) {
        let filtered = filtered_pets(pets, &self.query);
        if let Some(draft_pet_id) = self.draft_pet_id.as_deref()
            && let Some(index) = filtered
                .iter()
                .position(|pet| pet.runtime_id == draft_pet_id)
        {
            self.page_index = index / PICKER_PAGE_SIZE;
            return;
        }
        self.page_index = self.page_index.min(page_count(filtered.len()) - 1);
    }

    fn clamp_page(&mut self, pets: &[PetRecord]) {
        let filtered_count = filtered_pets(pets, &self.query).len();
        self.page_index = self.page_index.min(page_count(filtered_count) - 1);
    }
}

fn contains_pet(pets: &[PetRecord], runtime_id: Option<&str>) -> bool {
    runtime_id.is_some_and(|runtime_id| pets.iter().any(|pet| pet.runtime_id == runtime_id))
}

fn matching_id<'a>(pets: &'a [PetRecord], runtime_id: Option<&str>) -> Option<&'a str> {
    let runtime_id = runtime_id?;
    pets.iter()
        .find(|pet| pet.runtime_id == runtime_id)
        .map(|pet| pet.runtime_id.as_str())
}

fn filtered_pets<'a>(pets: &'a [PetRecord], query: &str) -> Vec<&'a PetRecord> {
    let normalized_query = query.trim().to_lowercase();
    pets.iter()
        .filter(|pet| {
            normalized_query.is_empty()
                || format!("{} {}", pet.manifest.display_name, pet.runtime_id)
                    .to_lowercase()
                    .contains(&normalized_query)
        })
        .collect()
}

fn page_count(filtered_count: usize) -> usize {
    filtered_count.div_ceil(PICKER_PAGE_SIZE).max(1)
}

fn visible_start(filtered_count: usize, page_index: usize, page_count: usize) -> usize {
    if page_index == page_count - 1 && filtered_count > PICKER_PAGE_SIZE {
        filtered_count - PICKER_PAGE_SIZE
    } else {
        page_index * PICKER_PAGE_SIZE
    }
}
